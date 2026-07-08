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
import {
  buildInterviewerSystemPrompt,
  buildInterviewerUserPrompt,
  parseCompletionSignal,
  type InterviewContext,
} from "./prompt-builders.js";
import {
  getQuestionWithSession,
  saveConversationAnswer,
  saveEvaluation,
} from "./questions.repository.js";

function buildContext(question: Awaited<ReturnType<typeof getQuestionWithSession>>): InterviewContext {
  if (!question) throw new Error("题目未找到");
  const session = question.interview_sessions;
  return {
    position: session.position,
    difficulty: session.difficulty,
    jobDescription: session.background,
    question: question.question,
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

  if (isCopiedQuestion(params.content, question.question)) {
    const response = buildRedirectResponse();
    conversation.push({ role: "assistant", content: response });
    await saveConversationAnswer(params.supabase, params.questionId, conversation);
    return { response };
  }

  const context = buildContext(question);
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
    await saveEvaluation({
      supabase: params.supabase,
      questionId: params.questionId,
      sessionId: question.session_id,
      answer: combinedCandidateAnswer(conversation),
      score: evaluation.score,
      feedback: evaluation.feedback,
    });

    return {
      response: closingResponse,
      done: true,
      score: evaluation.score,
      feedback: evaluation.feedback,
    };
  }

  await saveConversationAnswer(params.supabase, params.questionId, conversation);
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
  const evaluation = await evaluateConversationWithAI({
    context: buildContext(question),
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

  return evaluation;
}

