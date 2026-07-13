/**
 * 知识库 Brain 模块：输入校验 Zod Schema
 */

import { z } from "zod";

/** 创建知识库请求 */
export const CreateBrainSchema = z.object({
  name: z.string().trim().min(1, "知识库名称不能为空").max(100, "知识库名称最长 100 字"),
  description: z.string().trim().max(500).default(""),
  systemPrompt: z.string().trim().max(4000).nullable().optional(),
  embeddingProvider: z.string().trim().default("dashscope"),
});
export type CreateBrainInput = z.infer<typeof CreateBrainSchema>;

/** 更新知识库请求 */
export const UpdateBrainSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  systemPrompt: z.string().trim().max(4000).nullable().optional(),
});
export type UpdateBrainInput = z.infer<typeof UpdateBrainSchema>;

/** 关联文档到知识库请求 */
export const AddDocumentsToBrainSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1, "至少选择一个文档").max(100),
});
export type AddDocumentsToBrainInput = z.infer<typeof AddDocumentsToBrainSchema>;

/** 创建 QA 会话（扩展：支持指定 brainId）*/
export const CreateBrainQaSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});
export type CreateBrainQaSessionInput = z.infer<typeof CreateBrainQaSessionSchema>;
