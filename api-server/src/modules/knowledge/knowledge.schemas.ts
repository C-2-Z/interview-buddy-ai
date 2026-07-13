/** 知识库模块：输入校验 Zod Schema */

import { z } from "zod";

/** 上传文档请求 */
export const UploadDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(10_000_000),
  fileName: z.string().trim().max(255).optional(),
  fileType: z.enum(["pdf", "docx", "txt", "md"]),
  fileSize: z.number().int().positive().optional(),
  fileHash: z.string().trim().optional(),
});
export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>;

/** 批量删除文档请求，限制单次操作数量并拒绝非 UUID。 */
export const BatchDeleteDocumentsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
export type BatchDeleteDocumentsInput = z.infer<typeof BatchDeleteDocumentsSchema>;

/** 搜索请求 */
export const SearchSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  topK: z.number().int().min(1).max(50).default(5),
});
export type SearchInput = z.infer<typeof SearchSchema>;

/** 创建 QA 会话 */
export const CreateQaSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  documentIds: z.array(z.string().uuid()).max(50).default([]),
});
export type CreateQaSessionInput = z.infer<typeof CreateQaSessionSchema>;

/** 更新 QA 会话 */
export const UpdateQaSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});
export type UpdateQaSessionInput = z.infer<typeof UpdateQaSessionSchema>;

/** 提问请求 */
export const AskQuestionSchema = z.object({
  question: z.string().trim().min(1).max(10_000),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});
export type AskQuestionInput = z.infer<typeof AskQuestionSchema>;

/** 图谱阈值筛选 */
export const GraphQuerySchema = z.object({
  minSimilarity: z.number().min(0).max(1).default(0.7),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
});
export type GraphQueryInput = z.infer<typeof GraphQuerySchema>;
