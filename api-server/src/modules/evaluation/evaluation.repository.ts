import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { DimensionScores, DimensionSummary } from "./evaluation.types.js";

export async function saveDimensionScores(
  supabase: UserSupabaseClient,
  questionId: string,
  scores: DimensionScores,
): Promise<void> {
  await supabase
    .from("interview_questions")
    .update({ dimension_scores: scores } as any)
    .eq("id", questionId);
}

export async function saveDimensionSummary(
  supabase: UserSupabaseClient,
  sessionId: string,
  summary: DimensionSummary,
): Promise<void> {
  await supabase
    .from("interview_sessions")
    .update({ dimension_summary: summary } as any)
    .eq("id", sessionId);
}

export async function loadQuestionDimensionScores(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<{ id: string; dimension_scores: DimensionScores | null; score: number }[]> {
  const { data } = await supabase
    .from("interview_questions")
    .select("id, dimension_scores, score" as any)
    .eq("session_id", sessionId)
    .order("order_index");
  if (!data) return [];
  return data.map((row: any) => ({
    id: row.id as string,
    dimension_scores: (row.dimension_scores ?? null) as DimensionScores | null,
    score: (row.score as number) ?? 0,
  }));
}
