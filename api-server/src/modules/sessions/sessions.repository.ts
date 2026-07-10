import type { Database, Json } from "../../lib/supabase-types.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { ProviderName } from "../model-providers/provider.types.js";

type InterviewSessionInsert =
  Database["public"]["Tables"]["interview_sessions"]["Insert"];

export type CreateSessionRow = {
  user_id: string;
  skill_id: string | null;
  position: string;
  difficulty: string;
  interview_mode: "text" | "voice";
  job_description: string | null;
  model_provider: ProviderName;
  model_name: string | null;
  user_api_key: string | null;
  target_company: string | null;
  resume_text: string | null;
  question_type_config: Json | null;
};

export type CreateQuestionRow = {
  session_id: string;
  order_index: number;
  question: string;
  skill_id: string | null;
  topic_summary: string | null;
};

function isMissingSchemaColumn(message: string): boolean {
  return /schema cache|column .* does not exist|Could not find the '.*' column/i.test(
    message,
  );
}

function withFallbackInterviewMode<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    interview_mode:
      typeof row.interview_mode === "string"
        ? row.interview_mode
        : row.voice_mode === true
          ? "voice"
          : "text",
  };
}

export async function createSession(
  supabase: UserSupabaseClient,
  row: CreateSessionRow,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .insert(row)
    .select("id");
  if (!error) return data?.[0] as { id: string };

  if (!isMissingSchemaColumn(error.message)) throw new Error(error.message);

  const fallbackRow: InterviewSessionInsert = {
    ...row,
    voice_mode: row.interview_mode === "voice",
  };
  delete fallbackRow.interview_mode;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("interview_sessions")
    .insert(fallbackRow)
    .select("id");
  if (!fallbackError) return fallbackData?.[0] as { id: string };

  if (!isMissingSchemaColumn(fallbackError.message)) {
    throw new Error(fallbackError.message);
  }
  if (row.interview_mode === "text") {
    delete fallbackRow.voice_mode;
    const { data: legacyData, error: legacyError } = await supabase
      .from("interview_sessions")
      .insert(fallbackRow)
      .select("id");
    if (legacyError) throw new Error(legacyError.message);
    return legacyData?.[0] as { id: string };
  }

  throw new Error(
    "Database is missing interview mode columns. Apply the voice interview migrations before creating voice sessions.",
  );
}

export async function createQuestions(
  supabase: UserSupabaseClient,
  rows: CreateQuestionRow[],
): Promise<void> {
  const { error } = await supabase.from("interview_questions").insert(rows);
  if (error) throw new Error(error.message);
}

export async function listSessions(supabase: UserSupabaseClient) {
  const selectors = [
    "id, position, difficulty, status, overall_score, created_at, interview_mode, voice_mode",
    "id, position, difficulty, status, overall_score, created_at, interview_mode",
    "id, position, difficulty, status, overall_score, created_at, voice_mode",
    "id, position, difficulty, status, overall_score, created_at",
  ];

  for (const selector of selectors) {
    const { data, error } = await supabase
      .from("interview_sessions")
      .select(selector)
      .order("created_at", { ascending: false });

    if (!error) {
      return (data ?? []).map((row) =>
        withFallbackInterviewMode(row as unknown as Record<string, unknown>),
      );
    }
    if (!isMissingSchemaColumn(error.message)) throw new Error(error.message);
  }

  throw new Error(
    "Unable to list sessions because interview mode columns are unavailable.",
  );
}

export async function getSessionWithQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
) {
  const { data: session, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(error.message);

  const { data: questions, error: qErr } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index");
  if (qErr) throw new Error(qErr.message);

  return {
    session: withFallbackInterviewMode(
      session as unknown as Record<string, unknown>,
    ),
    questions: questions ?? [],
  };
}

export async function getSessionProviderConfig(
  supabase: UserSupabaseClient,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("model_provider, model_name, user_api_key")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getScoredQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("score, feedback, question")
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function completeSession(
  supabase: UserSupabaseClient,
  sessionId: string,
  overallScore: number,
  overallFeedback: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .update({
      status: "completed",
      overall_score: overallScore,
      overall_feedback: overallFeedback,
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
