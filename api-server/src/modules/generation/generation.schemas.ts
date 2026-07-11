import { z } from "zod";

export const GenerationSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const GenerationRetrySchema = z.object({
  force: z.boolean().optional().default(false),
});
