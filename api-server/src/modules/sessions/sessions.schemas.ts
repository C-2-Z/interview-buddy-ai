import { z } from "zod";

export const CreateSessionSchema = z.object({
  skillId: z.string().trim().min(1).max(50).optional(),
  position: z.string().trim().min(1).max(100),
  difficulty: z.enum(["初级", "中级", "高级"]),
  jobDescription: z.string().trim().max(2000).optional().default(""),
  questionCount: z.number().int().min(3).max(10).default(5),
  targetCompany: z.string().trim().max(100).optional().default(""),
  questionTypeConfig: z.record(z.number()).optional(),
  modelProvider: z.enum(["deepseek", "openai", "anthropic"]).optional(),
  modelName: z.string().trim().max(100).optional(),
  userApiKey: z.string().trim().max(500).optional().default(""),
  resumeText: z.string().max(2000).optional(),
  resumeId: z.string().uuid().optional(),
  interviewMode: z.enum(["text", "voice"]).optional(),
});

export type CreateSessionBody = z.infer<typeof CreateSessionSchema>;

