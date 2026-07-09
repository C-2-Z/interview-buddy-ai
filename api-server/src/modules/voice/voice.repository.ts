import type { UserSupabaseClient } from "../../shared/db/supabase.js";

export type VoiceSessionQuestion = {
  id: string;
  order_index: number;
  score: number | null;
};

function isMissingSchemaColumn(message: string): boolean {
  return /schema cache|column .* does not exist|Could not find the '.*' column/i.test(
    message,
  );
}

export async function markSessionVoiceMode(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .update({ voice_mode: true })
    .eq("id", sessionId);
  if (error) {
    if (isMissingSchemaColumn(error.message)) {
      console.warn(
        `[voice] interview_sessions.voice_mode is not available yet; skipping voice_mode flag for session ${sessionId}. Run the voice migration to persist this flag.`,
      );
      return;
    }
    throw new Error(error.message);
  }
}

export async function assertSessionAccess(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .select("id")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error("Session not found");
}

export async function listSessionQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<VoiceSessionQuestion[]> {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("id, order_index, score")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getNextUnscoredQuestionId(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const questions = await listSessionQuestions(supabase, sessionId);
  return questions.find((question) => question.score == null)?.id ?? null;
}
