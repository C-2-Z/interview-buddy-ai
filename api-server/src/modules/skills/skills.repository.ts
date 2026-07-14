/** Skill 历史出题记录 DB 访问 */
import type { SupabaseClient } from "@supabase/supabase-js";
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
  // 关系查询尚未写入生成类型，转换仅限当前仓储并保持认证实例不变。
  const database = supabase as unknown as SupabaseClient;
  let query = database
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
  return [
    ...new Set(
      data.map((row: { topic_summary: string | null }) => row.topic_summary).filter(Boolean),
    ),
  ] as string[];
}
