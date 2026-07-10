export type ResumeAnalysis = {
  skills: string[];
  workExperience: Array<{ company: string; role: string; years: string }>;
  projects: Array<{ name: string; techStack: string[]; description: string }>;
  education: { school: string; major: string; degree: string };
  overallAssessment: string;
  suggestedQuestions: string[];
};

export type ResumeListItem = {
  id: string;
  fileName: string;
  fileSize: number | null;
  analysis: Pick<ResumeAnalysis, "skills" | "overallAssessment"> | null;
  createdAt: string;
};

export type ResumeDetail = {
  id: string;
  fileName: string;
  fileSize: number;
  parsedText: string;
  analysis: ResumeAnalysis | null;
  isDuplicate: boolean;
  createdAt: string;
};

export type ResumeUploadResult = ResumeDetail;
