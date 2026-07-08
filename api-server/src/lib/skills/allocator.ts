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

export function queryHistoricalTopics(
  supabase: UserSupabaseClient,
  userIdOrSkillId: string,
  maybeSkillId?: string,
) {
  return queryHistoricalTopicsBySkill(supabase, maybeSkillId ?? userIdOrSkillId);
}
