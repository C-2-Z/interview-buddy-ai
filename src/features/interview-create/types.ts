export type Difficulty = "初级" | "中级" | "高级";
export type ModelProviderName = "deepseek" | "openai" | "anthropic";

export type CreateSessionParams = {
  skillId?: string;
  position: string;
  difficulty: Difficulty;
  jobDescription?: string;
  questionCount?: number;
  targetCompany?: string;
  questionTypeConfig?: Record<string, number>;
  resumeText?: string;
  modelProvider?: ModelProviderName;
  modelName?: string;
  userApiKey?: string;
};

export type SkillMeta = {
  id: string;
  name: string;
  description: string;
  categories: Array<{ key: string; label: string; priority: string }>;
};

