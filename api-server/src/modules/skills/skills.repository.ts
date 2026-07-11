/** Skill 历史出题记录 DB 访问 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";

/**
 * 查询 historical topics
 * @returns
 */
export async function queryHistoricalTopics(
  supabase: UserSupabaseClient,
  skillId: string,
  userId?: string,
): Promise<string[]> {
  let query = (supabase as any)
    .from("interview_questions")
    .select("topic_summary, interview_sessions!inner(user_id)")
    .eq("skill_id", skillId)
    .not("topic_summary", "is", null)
    .neq("topic_summary", "")
    .order("created_at", { ascending: false })
    .limit(50);
  if (userId) query = query.eq("interview_sessions.user_id", userId);
  const { data, error } = await query;

  if (error || !data) return [];
  return [...new Set(data.map((row: { topic_summary: string | null }) => row.topic_summary).filter(Boolean))] as string[];
}

