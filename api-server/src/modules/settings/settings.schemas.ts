import { z } from "zod";

export const UpdateSettingsSchema = z.object({
  model_provider: z.enum(["deepseek", "openai", "anthropic"]).optional(),
  model_name: z.string().trim().max(100).nullable().optional(),
  keys: z
    .object({
      deepseek: z.string().max(500).optional(),
      openai: z.string().max(500).optional(),
      anthropic: z.string().max(500).optional(),
    })
    .optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

