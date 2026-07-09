import type { Json } from "../../lib/supabase-types.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { ProviderName } from "../model-providers/provider.types.js";

export type CreateSessionRow = {
  user_id: string;
  skill_id: string | null;
  position: string;
  difficulty: string;
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

export async function createSession(
  supabase: UserSupabaseClient,
  row: CreateSessionRow,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("interview_sessions")
    .insert(row)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.[0] as { id: string };
}

export async function createQuestions(
  supabase: UserSupabaseClient,
  rows: CreateQuestionRow[],
): Promise<void> {
  const { error } = await supabase.from("interview_questions").insert(rows);
  if (error) throw new Error(error.message);
}

export async function listSessions(supabase: UserSupabaseClient) {
  const { data, error } = await supabase
    .from("interview_sessions")
    .select("id, position, difficulty, status, overall_score, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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

  return { session, questions: questions ?? [] };
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
