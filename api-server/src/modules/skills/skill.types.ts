export type CategoryPriority = "CORE" | "NORMAL" | "ALWAYS_ONE";

export interface CategoryDef {
  key: string;
  label: string;
  priority: CategoryPriority;
  ref?: string;
  shared?: boolean;
  max?: number;
}

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  persona: string;
  categories: CategoryDef[];
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  categories: Array<Pick<CategoryDef, "key" | "label" | "priority">>;
}

export interface GeneratedSkillQuestion {
  question: string;
  category: string;
}

