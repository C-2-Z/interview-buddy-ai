import type { ModelProvider } from "../model-providers/provider.types.js";

export type Difficulty = "初级" | "中级" | "高级";

export type CreateSessionInput = {
  skillId?: string;
  position: string;
  difficulty: Difficulty;
  jobDescription: string;
  questionCount: number;
  targetCompany: string;
  questionTypeConfig?: Record<string, number>;
  modelProvider?: ModelProvider["name"];
  modelName?: string;
  userApiKey?: string;
  resumeText?: string;
};

export type CreatedSession = {
  id: string;
};

export type GeneratedGenericQuestion = string;

export type GeneratedSkillQuestion = {
  question: string;
  category: string;
};

