/** Skill 配置文件加载（skill.json + persona.md）*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CategoryDef, SkillDef, SkillMeta } from "./skill.types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_DIR = join(__dirname, "..", "..", "lib", "skills");

let cache: SkillDef[] | null = null;

/**
 * 判断 skill dir
 *
 * @param entry - 
 * @returns 
 */
function isSkillDir(entry: string): boolean {
  try {
    const dir = join(SKILLS_DIR, entry);
    return (
      statSync(dir).isDirectory() &&
      entry !== "_shared" &&
      readdirSync(dir).includes("skill.json")
    );
  } catch {
    return false;
  }
}

/**
 * 加载 persona
 *
 * @param dir - 
 * @returns 
 */
function loadPersona(dir: string): string {
  try {
    return readFileSync(join(dir, "persona.md"), "utf-8").trim();
  } catch {
    return "";
  }
}

/**
 * 加载 skills
 * @returns 
 */
export function loadSkills(): SkillDef[] {
  if (cache) return cache;

  cache = readdirSync(SKILLS_DIR)
    .filter(isSkillDir)
    .map((entry) => {
      const dir = join(SKILLS_DIR, entry);
      const raw = readFileSync(join(dir, "skill.json"), "utf-8");
      const meta = JSON.parse(raw) as {
        id: string;
        name: string;
        description: string;
        categories: CategoryDef[];
      };
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        persona: loadPersona(dir),
        categories: meta.categories,
      };
    });

  return cache;
}

/**
 * 获取 skill
 *
 * @param id - 
 * @returns 
 */
export function getSkill(id: string): SkillDef | undefined {
  return loadSkills().find((skill) => skill.id === id);
}

/**
 * 获取 all skill metas
 * @returns 
 */
export function getAllSkillMetas(): SkillMeta[] {
  return loadSkills().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    categories: skill.categories.map((category) => ({
      key: category.key,
      label: category.label,
      priority: category.priority,
    })),
  }));
}

/**
 * invalidate skill cache
 * @returns void
 */
export function invalidateSkillCache(): void {
  cache = null;
}

/**
 * 获取 skills dir
 * @returns 
 */
export function getSkillsDir(): string {
  return SKILLS_DIR;
}

