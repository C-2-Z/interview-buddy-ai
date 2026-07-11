/** 创建语音面试 Zod Schema */
import { z } from "zod";
import { CreateSessionSchema } from "../sessions/sessions.schemas.js";

export const CreateVoiceSessionSchema = CreateSessionSchema.omit({
  interviewMode: true,
});

export type CreateVoiceSessionBody = z.infer<typeof CreateVoiceSessionSchema>;
