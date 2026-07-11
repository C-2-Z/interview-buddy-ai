import { callAI } from "../../shared/ai/ai-client.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { resolveProviderForSession } from "../model-providers/model-provider.service.js";
import {
  buildRedirectResponse,
  combinedCandidateAnswer,
  formatConversation,
  isCopiedQuestion,
  parseConversation,
} from "./conversation.service.js";
import { evaluateConversation as evaluateConversationWithAI } from "./evaluation.service.js";
import { appendInterviewMessage } from "./messages.repository.js";
import {
  buildInterviewerSystemPrompt,
  buildInterviewerUserPrompt,
  parseCompletionSignal,
  type InterviewContext,
} from "./prompt-builders.js";
import {
  getQuestionWithSession,
  countSessionQuestions,
  saveConversationAnswer,
  saveEvaluation,
  updateLastActivity,
} from "./questions.repository.js";

// 禁飞区① 手写硬限制：每题最多追问 3 轮（与 Prompt 中的规则双重保障）
const MAX_FOLLOWUPS = 3;
// 禁飞区① 手写安全阀：每题总消息数上限 20 条，防止无限循环
const MAX_TOTAL_MESSAGES = 20;

function isVoiceInterviewQuestion(
  question: Exclude<Awaited<ReturnType<typeof getQuestionWithSession>>, null>,
): boolean {
  return (
    question.interview_sessions.interview_mode === "voice" ||
    question.interview_sessions.voice_mode === true
  );
}

// 禁飞区① 辅助：构建面试上下文快照，每次追问时注入 Prompt
function buildContext(
  question: Awaited<ReturnType<typeof getQuestionWithSession>>,
  totalQuestions: number,
): InterviewContext {
  if (!question) throw new Error("题目未找到");
  const session = question.interview_sessions;
  return {
    position: session.position,
    difficulty: session.difficulty,
    jobDescription: session.job_description,
    question: question.question,
    totalQuestions,
    currentQuestionIndex: question.order_index,
    skillId: (session as any).skill_id ?? undefined,
  };
}

// ===== 禁飞区① 核心：追问循环控制中枢 =====
// 每次用户发送回答都会进入此函数，由手写决策树决定：
//   1. 作弊检测 → 拒绝代答
//   2. 轮次检测 → 超限则自动评分
//   3. 正常追问 → 调用 AI（由 buildInterviewerSystemPrompt 控制规则）
//   4. 完成信号检测 → 触发评分
//   5. 消息数量检测 → 超限则自动结束
export async function sendMessage(params: {
  supabase: UserSupabaseClient;
  userId: string;
  questionId: string;
  content: string;
}) {
  const question = await getQuestionWithSession(
    params.supabase,
    params.questionId,
  );
  if (!question) return { error: "题目未找到" } as const;
  if (isVoiceInterviewQuestion(question)) {
    return { error: "语音面试请使用语音面试页面" } as const;
  }

  const provider = await resolveProviderForSession(
    params.supabase,
    params.userId,
    question.interview_sessions,
  );
  const conversation = parseConversation(question.answer);
  conversation.push({ role: "user", content: params.content });
  await appendInterviewMessage(params.supabase, {
    questionId: params.questionId,
    role: "user",
    content: params.content,
    source: "text",
  });

    // 步骤3：作弊检测 — 候选人复制题目文本时拒绝代答
  if (isCopiedQuestion(params.content, question.question)) {
    const response = buildRedirectResponse();
    conversation.push({ role: "assistant", content: response });
    await appendInterviewMessage(params.supabase, {
      questionId: params.questionId,
      role: "assistant",
      content: response,
      source: "text",
    });
    await saveConversationAnswer(params.supabase, params.questionId, conversation);
    await updateLastActivity(params.supabase, question.session_id);
    return { response };
  }

  const totalQuestions = await countSessionQuestions(
    params.supabase,
    question.session_id,
  );

  const userMessages = conversation.filter((m) => m.role === "user").length;
    // 步骤4：轮次上限 — 已回答 > 3 轮时不再追问，自动评分
  if (userMessages > MAX_FOLLOWUPS) {
    await updateLastActivity(params.supabase, question.session_id);
    return autoEvaluateQuestion({
      question,
      conversation,
      provider,
      totalQuestions,
      supabase: params.supabase,
    });
  }

  const context = buildContext(question, totalQuestions);
  const conversationText = formatConversation(conversation);
    // 步骤5：正常追问 — 调用 AI（规则由 buildInterviewerSystemPrompt 控制）
  const response = await callAI(
    [
      { role: "system", content: buildInterviewerSystemPrompt(context) },
      {
        role: "user",
        content: buildInterviewerUserPrompt(conversationText, params.content),
      },
    ],
    provider,
  );
  conversation.push({ role: "assistant", content: response });

    // 步骤6：安全阀 — 消息总数 >= 20 条时强制结束
  if (conversation.length >= MAX_TOTAL_MESSAGES) {
    await updateLastActivity(params.supabase, question.session_id);
    return autoEvaluateQuestion({
      question,
      conversation,
      provider,
      totalQuestions,
      supabase: params.supabase,
    });
  }

    // 步骤7：检测完成信号 — AI 输出 {type:complete} 则本题结束
  const completionSignal = parseCompletionSignal(response);
  if (completionSignal) {
    const closingResponse = `感谢你的回答。${completionSignal.summary}下面我们进入下一题。`;
    conversation[conversation.length - 1] = {
      role: "assistant",
      content: closingResponse,
    };

    const evalConversation = conversation.filter(
      (message) => message.content !== closingResponse,
    );
    const evaluation = await evaluateConversationWithAI({
      context,
      conversationText: formatConversation(evalConversation),
      provider,
    });
    await appendInterviewMessage(params.supabase, {
      questionId: params.questionId,
      role: "assistant",
      content: closingResponse,
      source: "text",
    });
    await saveEvaluation({
      supabase: params.supabase,
      questionId: params.questionId,
      sessionId: question.session_id,
      answer: combinedCandidateAnswer(conversation),
      score: evaluation.score,
      feedback: evaluation.feedback,
      dimensionScores: evaluation.dimensions as any ?? undefined,
    });

    await updateLastActivity(params.supabase, question.session_id);
    return {
      response: closingResponse,
      done: true,
      score: evaluation.score,
      feedback: evaluation.feedback,
    };
  }

  await appendInterviewMessage(params.supabase, {
    questionId: params.questionId,
    role: "assistant",
    content: response,
    source: "text",
  });
  await saveConversationAnswer(params.supabase, params.questionId, conversation);
  await updateLastActivity(params.supabase, question.session_id);
  return { response };
}

export async function evaluateQuestionConversation(params: {
  supabase: UserSupabaseClient;
  userId: string;
  questionId: string;
}) {
  const question = await getQuestionWithSession(
    params.supabase,
    params.questionId,
  );
  if (!question) return { error: "题目未找到" } as const;
  if (isVoiceInterviewQuestion(question)) {
    return { error: "语音面试请使用语音面试页面" } as const;
  }

  const provider = await resolveProviderForSession(
    params.supabase,
    params.userId,
    question.interview_sessions,
  );
  const conversation = parseConversation(question.answer);
  const totalQuestions = await countSessionQuestions(
    params.supabase,
    question.session_id,
  );
  const evaluation = await evaluateConversationWithAI({
    context: buildContext(question, totalQuestions),
    conversationText: formatConversation(conversation),
    provider,
  });

  await saveEvaluation({
    supabase: params.supabase,
    questionId: params.questionId,
    answer: combinedCandidateAnswer(conversation),
    score: evaluation.score,
    feedback: evaluation.feedback,
    dimensionScores: evaluation.dimensions as any ?? undefined,
  });

  await updateLastActivity(params.supabase, question.session_id);
  return evaluation;
}

// 禁飞区① 辅助：轮次超限或消息超限时的自动评分，不经过追问
async function autoEvaluateQuestion(params: {
  question: Exclude<Awaited<ReturnType<typeof getQuestionWithSession>>, null>;
  conversation: import("./questions.repository.js").ConversationMessage[];
  provider: Awaited<ReturnType<typeof resolveProviderForSession>>;
  totalQuestions: number;
  supabase: UserSupabaseClient;
}) {
  const context = buildContext(params.question, params.totalQuestions);
  const conversationText = formatConversation(params.conversation);
  const evaluation = await evaluateConversationWithAI({
    context,
    conversationText,
    provider: params.provider,
  });
  const closingResponse =
    "感谢你的详细回答。我已经有了足够的信息来评估这个问题。";
  params.conversation.push({ role: "assistant", content: closingResponse });
  await saveEvaluation({
    supabase: params.supabase,
    questionId: params.question.id,
    sessionId: params.question.session_id,
    answer: combinedCandidateAnswer(params.conversation),
    score: evaluation.score,
    feedback: evaluation.feedback,
  });
  return {
    response: closingResponse,
    done: true as const,
    score: evaluation.score,
    feedback: evaluation.feedback,
  };
}