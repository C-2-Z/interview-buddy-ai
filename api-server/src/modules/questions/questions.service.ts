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
  };
}

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

  // --- copied question check (existing) ---
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

  // --- get session-level question count for context ---
  const totalQuestions = await countSessionQuestions(params.supabase, question.session_id);

  // --- follow-up counter check (Step 2) ---
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

  // --- AI call (existing flow) ---
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
  // --- total messages overflow check (existing + counter combined) ---
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

  const provider = await resolveProviderForSession(
    params.supabase,
    params.userId,
    question.interview_sessions,
  );
  const conversation = parseConversation(question.answer);
  const totalQuestions = await countSessionQuestions(params.supabase, question.session_id);
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
  });

  await updateLastActivity(params.supabase, question.session_id);
  return evaluation;
}

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
  const closingResponse = "感谢你的详细回答。我已经有了足够的信息来评估这个问题。";
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
