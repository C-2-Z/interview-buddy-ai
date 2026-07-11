/** 题目分配算法兼容导出 */
export {
  buildDedupInstruction,
  buildReferenceSection,
  calculateAllocation,
  renderAllocationTable,
} from "../../modules/skills/allocation.service.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  queryHistoricalTopics as queryHistoricalTopicsBySkill,
} from "../../modules/skills/skills.repository.js";

/**
 * 查询 historical topics
 * @returns 
 */
export function queryHistoricalTopics(
  supabase: UserSupabaseClient,
  userIdOrSkillId: string,
  maybeSkillId?: string,
) {
  return queryHistoricalTopicsBySkill(supabase, maybeSkillId ?? userIdOrSkillId);
}
