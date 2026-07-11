/** 发送消息请求体的 Zod Schema */
import { z } from "zod";

export const SendMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

