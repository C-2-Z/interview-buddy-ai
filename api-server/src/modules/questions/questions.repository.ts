 import type { UserSupabaseClient } from "../../shared/db/supabase.js";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type QuestionSessionContext = {
  position: string;
  difficulty: string;
  job_description: string | null;
  model_provider: string | null;
  model_name: string | null;
  user_api_key: string | null;
};

export type QuestionWithSession = {
  id: string;
  question: string;
  answer: string | null;
  session_id: string;
  order_index: number;
  interview_sessions: QuestionSessionContext;
};

export async function getQuestionWithSession(
  supabase: UserSupabaseClient,
  questionId: string,
): Promise<QuestionWithSession | null> {
  const { data, error } = await supabase
    .from("interview_questions")
    .select(
      "id, question, answer, session_id, order_index, interview_sessions(position, difficulty, job_description, model_provider, model_name, user_api_key)",
    )
    .eq("id", questionId)
    .single();

  if (error || !data) return null;
  return data as unknown as QuestionWithSession;
}

export async function saveConversationAnswer(
  supabase: UserSupabaseClient,
  questionId: string,
  conversation: ConversationMessage[],
): Promise<void> {
  const { error } = await supabase
    .from("interview_questions")
    .update({ answer: JSON.stringify(conversation) })
    .eq("id", questionId);
  if (error) throw new Error(error.message);
}

export async function saveEvaluation(params: {
  supabase: UserSupabaseClient;
  questionId: string;
  sessionId?: string;
  answer: string;
  score: number;
  feedback: string;
}): Promise<void> {
  let query = params.supabase
    .from("interview_questions")
    .update({
      answer: params.answer,
      score: params.score,
      feedback: params.feedback,
    })
    .eq("id", params.questionId);

  if (params.sessionId) {
    query = query.eq("session_id", params.sessionId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function countSessionQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("interview_questions")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function updateLastActivity(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
