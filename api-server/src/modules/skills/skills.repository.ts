import type { UserSupabaseClient } from "../../shared/db/supabase.js";

export async function queryHistoricalTopics(
  supabase: UserSupabaseClient,
  skillId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("topic_summary")
    .eq("skill_id", skillId)
    .not("topic_summary", "is", null)
    .neq("topic_summary", "");

  if (error || !data) return [];
  return [...new Set(data.map((row) => row.topic_summary).filter(Boolean))];
}

