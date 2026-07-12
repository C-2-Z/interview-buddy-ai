/** Interview Agent Phase 4 模型证据与评分输出的严格 Zod 契约。 */
import { z } from "zod";

/** 模型证据输出，不允许模型决定数据库 UUID。 */
export const ModelEvidenceOutputSchema = z.object({
  evidence: z.array(z.object({
    messageId: z.string().uuid(),
    dimensionKey: z.string().trim().min(1).max(100),
    claim: z.string().trim().min(1).max(500),
    quote: z.string().trim().min(1).max(1_000),
    polarity: z.enum(["positive", "negative", "neutral"]),
    confidence: z.number().min(0).max(1),
  }).strict()).max(50),
}).strict();

/** 模型评分输出；overallScore 由代码计算，因此不接受模型提供。 */
export const ModelEvaluationOutputSchema = z.object({
  dimensions: z.record(z.object({
    score: z.number().int().min(0).max(100),
    rationale: z.string().trim().min(1).max(1_000),
    evidenceIds: z.array(z.string().uuid()).max(50),
  }).strict()),
  feedback: z.string().trim().min(1).max(2_000),
}).strict();

/** 模型证据输出。 */
export type ModelEvidenceOutput = z.infer<typeof ModelEvidenceOutputSchema>;
/** 模型评分输出。 */
export type ModelEvaluationOutput = z.infer<typeof ModelEvaluationOutputSchema>;
