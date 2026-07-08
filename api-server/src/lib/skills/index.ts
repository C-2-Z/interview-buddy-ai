import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillDef, SkillMeta, CategoryDef } from "./skill-schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_DIR = join(__dirname);

let _cache: SkillDef[] | null = null;

function isSkillDir(p: string): boolean {
  try {
    return statSync(join(SKILLS_DIR, p)).isDirectory()
      && p !== "_shared"
      && readdirSync(join(SKILLS_DIR, p)).includes("skill.json");
  } catch { return false; }
}

function loadPersona(dir: string): string {
  try {
    return readFileSync(join(dir, "persona.md"), "utf-8").trim();
  } catch {
    return "";
  }
}

export function loadSkills(): SkillDef[] {
  if (_cache) return _cache;

  const entries = readdirSync(SKILLS_DIR).filter(isSkillDir);
  _cache = entries.map((entry) => {
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

  return _cache;
}

export function getSkill(id: string): SkillDef | undefined {
  return loadSkills().find((s) => s.id === id);
}

export function getAllSkills(): SkillDef[] {
  return loadSkills();
}

export function getAllSkillMetas(): SkillMeta[] {
  return loadSkills().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    categories: s.categories.map((c) => ({
      key: c.key,
      label: c.label,
      priority: c.priority,
    })),
  }));
}

/** Invalidate the cache (useful in tests or hot-reload). */
export function invalidateCache(): void {
  _cache = null;
}
