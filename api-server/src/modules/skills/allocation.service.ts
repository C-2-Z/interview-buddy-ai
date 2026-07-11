/** Skill 题目数量分配算法 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CategoryDef, SkillDef } from "./skill.types.js";
import { getSkillsDir } from "./skill-loader.js";

const SHARED_REF_DIR = join(getSkillsDir(), "_shared", "references");

/**
 * calculate allocation
 * @returns 
 */
export function calculateAllocation(
  categories: CategoryDef[],
  total: number,
): Map<string, number> {
  const allocation = new Map<string, number>();
  const alwaysOne = categories.filter((c) => c.priority === "ALWAYS_ONE");
  const core = categories.filter((c) => c.priority === "CORE");
  const normal = categories.filter((c) => c.priority === "NORMAL");

  let remaining = total;
  for (const category of alwaysOne) {
    allocation.set(category.key, 1);
    remaining -= 1;
  }

  for (const category of [...core, ...normal]) {
    if (remaining <= 0) break;
    const current = allocation.get(category.key) ?? 0;
    const cap = category.max ?? Infinity;
    if (current < cap) {
      allocation.set(category.key, current + 1);
      remaining -= 1;
    }
  }

  const pool = [...core, ...normal];
  while (remaining > 0) {
    for (const category of pool) {
      if (remaining <= 0) break;
      const current = allocation.get(category.key) ?? 0;
      const cap = category.max ?? Infinity;
      if (current < cap) {
        allocation.set(category.key, current + 1);
        remaining -= 1;
      }
    }
    const allAtCap = pool.every(
      (category) =>
        (allocation.get(category.key) ?? 0) >= (category.max ?? Infinity),
    );
    if (allAtCap) break;
  }

  return allocation;
}

/**
 * 构建 reference section
 * @returns 
 */
export function buildReferenceSection(
  skill: SkillDef,
  allocation: Map<string, number>,
): string {
  const parts: string[] = [];

  for (const category of skill.categories) {
    const count = allocation.get(category.key) ?? 0;
    if (count <= 0 || !category.ref) continue;

    const refPath = category.shared
      ? join(SHARED_REF_DIR, category.ref)
      : join(getSkillsDir(), skill.id, "references", category.ref);

    try {
      const content = readFileSync(refPath, "utf-8").trim();
      const truncated =
        content.length > 3000
          ? `${content.slice(0, 3000)}\n\n... (以下省略)`
          : content;
      parts.push(`## ${category.label} 参考知识点\n\n${truncated}`);
    } catch {
      // Missing reference files should not block question generation.
    }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * 渲染 allocation table
 * @returns 
 */
export function renderAllocationTable(
  categories: CategoryDef[],
  allocation: Map<string, number>,
): string {
  const rows = categories
    .filter((category) => (allocation.get(category.key) ?? 0) > 0)
    .map((category) => `| ${category.label} | ${allocation.get(category.key)} |`)
    .join("\n");

  return `\n请生成以下分类和数量的题目：\n\n| 分类 | 数量 |\n|------|------|\n${rows}\n`;
}

/**
 * 构建 dedup instruction
 *
 * @param historicalTopics - 
 * @returns 
 */
export function buildDedupInstruction(historicalTopics: string[]): string {
  if (historicalTopics.length === 0) return "";
  return `\n注意：以下分类的题目候选人之前已经回答过，请避免出完全相同的题目，可以从其他角度或更深层次提问：\n${historicalTopics.join("、")}`;
}

