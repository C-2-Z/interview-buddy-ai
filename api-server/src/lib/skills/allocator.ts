import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CategoryDef, SkillDef } from "./skill-schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = __dirname;
const SHARED_REF_DIR = join(SKILLS_DIR, "_shared", "references");

/**
 * 3-phase allocation algorithm:
 *  Phase 1 — ALWAYS_ONE categories each get 1 slot.
 *  Phase 2 — Every category gets 1 slot (CORE first, then NORMAL).
 *  Phase 3 — Remaining slots distributed round-robin (CORE > NORMAL).
 */
export function calculateAllocation(
  categories: CategoryDef[],
  total: number,
): Map<string, number> {
  const alloc = new Map<string, number>();
  const alwaysOne = categories.filter((c) => c.priority === "ALWAYS_ONE");
  const core = categories.filter((c) => c.priority === "CORE");
  const normal = categories.filter((c) => c.priority === "NORMAL");

  // Phase 1: ALWAYS_ONE reserve
  let remaining = total;
  for (const c of alwaysOne) {
    alloc.set(c.key, 1);
    remaining -= 1;
  }

  // Phase 2: each category gets 1 (ALWAYS_ONE already has 1 from Phase 1)
  const all = [...core, ...normal];
  for (const c of all) {
    if (remaining <= 0) break;
    const current = alloc.get(c.key) ?? 0;
    const cap = c.max ?? Infinity;
    if (current < cap) {
      alloc.set(c.key, current + 1);
      remaining -= 1;
    }
  }

  // Phase 3: round-robin, CORE priority first
  const pool = [...core, ...normal];
  while (remaining > 0) {
    for (const c of pool) {
      if (remaining <= 0) break;
      const current = alloc.get(c.key) ?? 0;
      const cap = c.max ?? Infinity;
      if (current < cap) {
        alloc.set(c.key, current + 1);
        remaining -= 1;
      }
    }
    // Safety: if all categories hit their cap, break
    const allAtCap = pool.every((c) => (alloc.get(c.key) ?? 0) >= (c.max ?? Infinity));
    if (allAtCap) break;
  }

  return alloc;
}

/**
 * Load reference documents for categories that have >0 allocation.
 * Returns a Markdown-formatted reference section to inject into the prompt.
 */
export function buildReferenceSection(
  skillDef: SkillDef,
  allocation: Map<string, number>,
): string {
  const parts: string[] = [];

  for (const cat of skillDef.categories) {
    const count = allocation.get(cat.key) ?? 0;
    if (count <= 0 || !cat.ref) continue;

    let refPath: string;
    if (cat.shared) {
      refPath = join(SHARED_REF_DIR, cat.ref);
    } else {
      refPath = join(SKILLS_DIR, skillDef.id, "references", cat.ref);
    }

    try {
      const content = readFileSync(refPath, "utf-8").trim();
      // Truncate to 3000 chars to keep prompt manageable
      const truncated = content.length > 3000
        ? content.slice(0, 3000) + "\n\n... (以下省略)"
        : content;
      parts.push(`## ${cat.label} 参考知识点\n\n${truncated}`);
    } catch {
      // Reference file missing, skip silently
    }
  }

  return parts.length > 0 ? parts.join("\n\n---\n\n") : "";
}

/**
 * Build a deduplication instruction string from a list of previously-seen topic summaries.
 */
export function buildDedupInstruction(historicalTopics: string[]): string {
  if (historicalTopics.length === 0) return "";
  return `\n注意：以下分类的题目候选人之前已经回答过，请避免出完全相同的题目，可以从其他角度或更深层次提问：\n${historicalTopics.join("、")}`;
}

/**
 * Query historical topic summaries from the database for a given user + skill.
 * Returns distinct topic_summary strings.
 */
export async function queryHistoricalTopics(
  supabase: ReturnType<typeof import("../supabase.js").createUserClient>,
  userId: string,
  skillId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("topic_summary")
    .eq("skill_id", skillId)
    .not("topic_summary", "is", null)
    .neq("topic_summary", "");

  if (error || !data) return [];

  const distinct = [...new Set(data.map((r) => r.topic_summary as string))];
  return distinct;
}

/**
 * Render the allocation table as a Markdown table string.
 */
export function renderAllocationTable(
  categories: CategoryDef[],
  allocation: Map<string, number>,
): string {
  const rows = categories
    .filter((c) => (allocation.get(c.key) ?? 0) > 0)
    .map((c) => `| ${c.label} | ${allocation.get(c.key)} |`)
    .join("\n");

  return `\n请生成以下分类和数量的题目：\n\n| 分类 | 数量 |\n|------|------|\n${rows}\n`;
}

