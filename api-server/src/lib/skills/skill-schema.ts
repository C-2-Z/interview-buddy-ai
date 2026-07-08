export type CategoryPriority = "CORE" | "NORMAL" | "ALWAYS_ONE";

export interface CategoryDef {
  key: string;
  label: string;
  priority: CategoryPriority;
  /** Filename of the reference doc (e.g. "java.md"). Omit if no reference. */
  ref?: string;
  /** If true, reference is loaded from _shared/references/ instead of skill-local references/. */
  shared?: boolean;
  /** Optional cap on max questions for this category (default: no cap). */
  max?: number;
}

export interface SkillDef {
  /** Directory name, e.g. "java-backend". */
  id: string;
  /** Human-readable name, e.g. "Java 后端开发". */
  name: string;
  /** Short description for the selection UI. */
  description: string;
  /** Full interviewer persona (loaded from persona.md). */
  persona: string;
  /** Category breakdown for question allocation. */
  categories: CategoryDef[];
}

/** Lightweight metadata returned by GET /api/skills (no persona). */
export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  categories: Array<Pick<CategoryDef, "key" | "label" | "priority">>;
}

/** One generated question with its category annotation. */
export interface GeneratedQuestion {
  question: string;
  category: string;
}
