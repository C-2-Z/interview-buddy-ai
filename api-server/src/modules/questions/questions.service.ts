/** 面试对话业务：处理消息/检测完成/触发评分 */
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

const MAX_FOLLOWUPS = 3;
const MAX_TOTAL_MESSAGES = 20;

/**
 * 判断 voice interview question
 * @returns 
 */
function isVoiceInterviewQuestion(
  question: Exclude<Awaited<ReturnType<typeof getQuestionWithSession>>, null>,
): boolean {
  return (
    question.interview_sessions.interview_mode === "voice" ||
    question.interview_sessions.voice_mode === true
  );
}

/**
 * 构建 context
 * @returns 
 */
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


/** 处理用户发送的消息：
 *  1. 追加对话历史
 *  2. 检测复制题目
 *  3. 检查追问上限
 *  4. 调用 AI 生成追问
 *  5. 检测完成信号触发评分 */
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


/** 手动触发当前题目的 AI 评分 */
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

/**
 * auto 评估 question
 * @returns 
 */
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
