import type {
  CreateSessionParams,
  Difficulty,
  ModelProviderName,
  SkillMeta,
} from "@/features/interview-create/types";

export type InterviewSetupMode = "text" | "voice";

export type InterviewSetupSearch = {
  resumeId?: string;
  sourceSessionId?: string;
};

export type SetupResume = {
  id: string;
  fileName: string;
  parsedText: string;
};

export type InterviewSetupDraft = {
  selectedSkillId: string | null;
  useCustom: boolean;
  position: string;
  difficulty: Difficulty;
  jobDescription: string;
  targetCompany: string;
  typeProfile: string;
  resumeId?: string;
  resumeName: string;
  resumeText: string;
  count: number;
  modelProvider: ModelProviderName;
};

export type InterviewSetupSubmission = CreateSessionParams;
export type { Difficulty, ModelProviderName, SkillMeta };
