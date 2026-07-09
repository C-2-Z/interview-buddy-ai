import { callAI, streamAI } from "../../shared/ai/ai-client.js";
import { parseJsonFromAI } from "../../shared/ai/json-parser.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { resolveProviderForSession } from "../model-providers/model-provider.service.js";
import type { ModelProvider } from "../model-providers/provider.types.js";
import type { ConversationMessage } from "../questions/questions.repository.js";
import {
  buildRedirectResponse,
  combinedCandidateAnswer,
  formatConversation,
  isCopiedQuestion,
} from "../questions/conversation.service.js";
import {
  appendInterviewMessage,
  listQuestionMessages,
  messagesFromAnswer,
  type InterviewMessage,
} from "../questions/messages.repository.js";
import {
  getQuestionWithSession,
  countSessionQuestions,
  saveEvaluation,
  type QuestionWithSession,
} from "../questions/questions.repository.js";
import { finishSession } from "../sessions/sessions.service.js";
import {
  buildVoiceDecisionUserPrompt,
  buildVoiceInterviewerSystemPrompt,
  buildVoiceInterviewerUserPrompt,
  buildVoiceStreamingSystemPrompt,
  buildVoiceStreamingUserPrompt,
} from "./voice-prompt.service.js";
import { getNextUnscoredQuestionId } from "./voice.repository.js";
import type { VoiceDecision } from "./voice.types.js";

export type VoiceTurnResult = {
  response: string;
  action: VoiceDecision["action"];
  score?: number;
  feedback?: string;
  nextQuestionId?: string | null;
  sessionCompleted?: {
    overallScore: number;
    overallFeedback: string;
  };
};

type VoiceTurnBase = {
  supabase: UserSupabaseClient;
  userId: string;
  sessionId: string;
  questionId: string;
  turnId: string;
  transcript: string;
  confidence: number | null;
  question: QuestionWithSession;
  conversation: ConversationMessage[];
  historyText: string;
};

export type PreparedVoiceTurn =
  | (VoiceTurnBase & {
      kind: "redirect";
      response: string;
    })
  | (VoiceTurnBase & {
      kind: "interview";
      provider: ModelProvider;
      context: {
        position: string;
        difficulty: string;
        jobDescription: string | null;
        question: string;
        totalQuestions: number;
        currentQuestionIndex: number;
      };
    });

async function buildContext(question: QuestionWithSession, supabase: UserSupabaseClient) {
  const session = question.interview_sessions;
  const totalQuestions = await countSessionQuestions(supabase, question.session_id);
  return {
    position: session.position,
    difficulty: session.difficulty,
    jobDescription: session.job_description,
    question: question.question,
    totalQuestions,
    currentQuestionIndex: question.order_index,
  };
}

function toConversationMessages(messages: InterviewMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 60;
  return Math.max(1, Math.min(100, Math.round(score)));
}

function normalizeDecision(text: string): VoiceDecision {
  try {
    const parsed = parseJsonFromAI<Record<string, unknown>>(text);
    const action = parsed.action;
    const response = String(parsed.response ?? "").trim();
    if (
      (action === "follow_up" ||
        action === "finish_question" ||
        action === "finish_session" ||
        action === "redirect") &&
      response
    ) {
      if (action === "finish_question") {
        return {
          action,
          response,
          score: clampScore(parsed.score),
          feedback: String(parsed.feedback ?? "Voice interview answer evaluated."),
        };
      }
      return { action, response } as VoiceDecision;
    }
  } catch {
    // Fall back to treating the model output as a normal follow-up.
  }
  return {
    action: "follow_up",
    response: text.trim() || "Please continue with your answer.",
  };
}

async function loadQuestionMessages(params: {
  supabase: UserSupabaseClient;
  questionId: string;
  legacyAnswer: string | null;
}): Promise<InterviewMessage[]> {
  const messages = await listQuestionMessages(params.supabase, params.questionId);
  if (messages.length > 0) return messages;
  return messagesFromAnswer(params.legacyAnswer).map((message) => ({
    ...message,
    question_id: params.questionId,
  }));
}

export async function prepareVoiceTurn(params: {
  supabase: UserSupabaseClient;
  userId: string;
  sessionId: string;
  questionId: string;
  turnId: string;
  transcript: string;
  confidence: number | null;
}): Promise<PreparedVoiceTurn> {
  const question = await getQuestionWithSession(
    params.supabase,
    params.questionId,
  );
  if (!question || question.session_id !== params.sessionId) {
    throw new Error("Question not found");
  }

  const history = await loadQuestionMessages({
    supabase: params.supabase,
    questionId: params.questionId,
    legacyAnswer: question.answer,
  });

  await appendInterviewMessage(params.supabase, {
    questionId: params.questionId,
    role: "user",
    content: params.transcript,
    source: "voice",
    turnId: params.turnId,
    sttConfidence: params.confidence,
    endedAt: new Date().toISOString(),
  });

  const conversation = [
    ...toConversationMessages(history),
    { role: "user" as const, content: params.transcript },
  ];
  const historyText = formatConversation(conversation);

  const base: VoiceTurnBase = {
    ...params,
    question,
    conversation,
    historyText,
  };

  if (isCopiedQuestion(params.transcript, question.question)) {
    return {
      ...base,
      kind: "redirect",
      response: buildRedirectResponse(),
    };
  }

  const provider = await resolveProviderForSession(
    params.supabase,
    params.userId,
    question.interview_sessions,
  );

  return {
    ...base,
    kind: "interview",
    provider,
    context: await buildContext(question, params.supabase),
  };
}

export async function* streamVoiceReply(
  turn: Extract<PreparedVoiceTurn, { kind: "interview" }>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  for await (const delta of streamAI(
    [
      { role: "system", content: buildVoiceStreamingSystemPrompt(turn.context) },
      {
        role: "user",
        content: buildVoiceStreamingUserPrompt({
          history: turn.historyText,
          latestAnswer: turn.transcript,
        }),
      },
    ],
    turn.provider,
    signal,
  )) {
    yield delta;
  }
}

export async function appendVoiceAssistantMessage(params: {
  turn: PreparedVoiceTurn;
  content: string;
  interrupted?: boolean;
}): Promise<void> {
  const content = params.content.trim();
  if (!content) return;
  await appendInterviewMessage(params.turn.supabase, {
    questionId: params.turn.questionId,
    role: "assistant",
    content,
    source: "voice",
    turnId: params.turn.turnId,
    interrupted: params.interrupted ?? false,
    endedAt: new Date().toISOString(),
  });
}

export async function decideVoiceTurn(
  turn: PreparedVoiceTurn,
  assistantResponse: string,
): Promise<VoiceTurnResult> {
  if (turn.kind === "redirect") {
    return { response: assistantResponse || turn.response, action: "redirect" };
  }

  const text = await callAI(
    [
      { role: "system", content: buildVoiceInterviewerSystemPrompt(turn.context) },
      {
        role: "user",
        content: buildVoiceDecisionUserPrompt({
          history: turn.historyText,
          latestAnswer: turn.transcript,
          assistantResponse,
        }),
      },
    ],
    turn.provider,
  );
  const decision = normalizeDecision(text);
  const response = assistantResponse.trim() || decision.response;

  if (decision.action === "finish_question") {
    await saveEvaluation({
      supabase: turn.supabase,
      questionId: turn.questionId,
      sessionId: turn.sessionId,
      answer: combinedCandidateAnswer(turn.conversation),
      score: decision.score,
      feedback: decision.feedback,
    });

    const nextQuestionId = await getNextUnscoredQuestionId(
      turn.supabase,
      turn.sessionId,
    );
    if (!nextQuestionId) {
      const completed = await finishSession({
        supabase: turn.supabase,
        userId: turn.userId,
        sessionId: turn.sessionId,
      });
      return {
        response,
        action: decision.action,
        score: decision.score,
        feedback: decision.feedback,
        nextQuestionId: null,
        sessionCompleted: completed,
      };
    }

    return {
      response,
      action: decision.action,
      score: decision.score,
      feedback: decision.feedback,
      nextQuestionId,
    };
  }

  if (decision.action === "finish_session") {
    const completed = await finishSession({
      supabase: turn.supabase,
      userId: turn.userId,
      sessionId: turn.sessionId,
    });
    return {
      response,
      action: decision.action,
      sessionCompleted: completed,
    };
  }

  return {
    response,
    action: decision.action,
  };
}

export async function handleVoiceTranscript(params: {
  supabase: UserSupabaseClient;
  userId: string;
  sessionId: string;
  questionId: string;
  turnId: string;
  transcript: string;
  confidence: number | null;
}): Promise<VoiceTurnResult> {
  const turn = await prepareVoiceTurn(params);
  let response = "";

  if (turn.kind === "redirect") {
    response = turn.response;
  } else {
    for await (const delta of streamVoiceReply(turn)) response += delta;
    response = response.trim() || "Please continue with your answer.";
  }

  await appendVoiceAssistantMessage({ turn, content: response });
  return decideVoiceTurn(turn, response);
}
