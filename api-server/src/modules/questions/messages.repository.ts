/** 消息 DB 访问 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { ConversationMessage } from "./questions.repository.js";

export type InterviewMessageSource = "text" | "voice";

export type InterviewMessage = {
  id: string;
  question_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  source: InterviewMessageSource;
  audio_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  interrupted: boolean;
  turn_id: string | null;
  stt_confidence: number | null;
};

export type InsertInterviewMessage = {
  questionId: string;
  role: "user" | "assistant";
  content: string;
  source?: InterviewMessageSource;
  audioUrl?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  interrupted?: boolean;
  turnId?: string | null;
  sttConfidence?: number | null;
};

/**
 * 判断 missing schema column
 *
 * @param message - 
 * @returns 
 */
function isMissingSchemaColumn(message: string): boolean {
  return /schema cache|column .* does not exist|Could not find the '.*' column/i.test(
    message,
  );
}

/**
 * 归一化 message
 *
 * @param row - 
 * @param unknown> - 
 * @returns 
 */
function normalizeMessage(row: Record<string, unknown>): InterviewMessage {
  return {
    id: String(row.id),
    question_id: String(row.question_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content ?? ""),
    created_at: String(row.created_at),
    source: row.source === "voice" ? "voice" : "text",
    audio_url: (row.audio_url as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    interrupted: Boolean(row.interrupted),
    turn_id: (row.turn_id as string | null) ?? null,
    stt_confidence:
      typeof row.stt_confidence === "number" ? row.stt_confidence : null,
  };
}

/**
 * messages from answer
 *
 * @param answer - 
 * @returns 
 */
export function messagesFromAnswer(answer: string | null): InterviewMessage[] {
  if (!answer) return [];
  try {
    const parsed = JSON.parse(answer) as ConversationMessage[];
    if (Array.isArray(parsed)) {
      return parsed.map((message, index) => ({
        id: `legacy-${index}`,
        question_id: "",
        role: message.role,
        content: message.content,
        created_at: new Date(0).toISOString(),
        source: "text",
        audio_url: null,
        started_at: null,
        ended_at: null,
        interrupted: false,
        turn_id: null,
        stt_confidence: null,
      }));
    }
  } catch {
    // Legacy scored answers may be stored as plain text.
  }
  return answer.trim()
    ? [
        {
          id: "legacy-0",
          question_id: "",
          role: "user",
          content: answer,
          created_at: new Date(0).toISOString(),
          source: "text",
          audio_url: null,
          started_at: null,
          ended_at: null,
          interrupted: false,
          turn_id: null,
          stt_confidence: null,
        },
      ]
    : [];
}

/**
 * 追加 interview message
 * @returns 
 */
export async function appendInterviewMessage(
  supabase: UserSupabaseClient,
  message: InsertInterviewMessage,
): Promise<InterviewMessage> {
  const { data, error } = await supabase
    .from("interview_messages")
    .insert({
      question_id: message.questionId,
      role: message.role,
      content: message.content,
      source: message.source ?? "text",
      audio_url: message.audioUrl ?? null,
      started_at: message.startedAt ?? null,
      ended_at: message.endedAt ?? null,
      interrupted: message.interrupted ?? false,
      turn_id: message.turnId ?? null,
      stt_confidence: message.sttConfidence ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingSchemaColumn(error.message)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("interview_messages")
        .insert({
          question_id: message.questionId,
          role: message.role,
          content: message.content,
        })
        .select("*")
        .single();
      if (fallbackError) throw new Error(fallbackError.message);
      return normalizeMessage(fallbackData as Record<string, unknown>);
    }
    throw new Error(error.message);
  }
  return normalizeMessage(data as Record<string, unknown>);
}

/**
 * 列出 question messages
 * @returns 
 */
export async function listQuestionMessages(
  supabase: UserSupabaseClient,
  questionId: string,
): Promise<InterviewMessage[]> {
  const { data, error } = await supabase
    .from("interview_messages")
    .select("*")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeMessage(row));
}

/**
 * 列出 session messages
 * @returns 
 */
export async function listSessionMessages(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<InterviewMessage[]> {
  const { data: questions, error: qErr } = await supabase
    .from("interview_questions")
    .select("id")
    .eq("session_id", sessionId);
  if (qErr) throw new Error(qErr.message);

  /**
   * question ids
   *
   * @param questions - 
   * @returns 
   */
  const questionIds = (questions ?? []).map((question) => question.id);
  if (questionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("interview_messages")
    .select("*")
    .in("question_id", questionIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeMessage(row));
}

/**
 * 标记 turn interrupted
 * @returns 
 */
export async function markTurnInterrupted(
  supabase: UserSupabaseClient,
  turnId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_messages")
    .update({ interrupted: true, ended_at: new Date().toISOString() })
    .eq("turn_id", turnId)
    .eq("role", "assistant");
  if (error) {
    if (isMissingSchemaColumn(error.message)) return;
    throw new Error(error.message);
  }
}
