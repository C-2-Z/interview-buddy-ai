/** Interview Agent HTTP 路径参数和请求体的 Zod 校验契约。 */
import { z } from "zod";
import type {
  FrozenAgentConfig,
  InterviewAgentState,
  RoleStage,
} from "./interview-agent.types.js";

/** 客户端或服务端生成的稳定操作标识，可使用 UUID 或现有语音 turnId。 */
const StableOperationIdSchema = z.string().trim().min(1).max(180);

/** 创建 Agent 会话请求；strict 防止凭据等未声明字段进入冻结配置。 */
export const CreateAgentSessionSchema = z
  .object({
    mode: z.enum(["single", "panel"]),
    interviewMode: z.enum(["text", "voice"]),
    position: z.string().trim().min(1).max(100),
    difficulty: z.enum(["初级", "中级", "高级"]),
    questionCount: z.number().int().min(3).max(10),
    jobDescription: z.string().trim().max(2000).optional(),
    targetCompany: z.string().trim().max(100).optional(),
    skillId: z.string().trim().min(1).max(100).optional(),
    resumeId: z.string().uuid().optional(),
    modelProvider: z.enum(["deepseek", "openai", "anthropic"]).optional(),
    modelName: z.string().trim().min(1).max(100).optional(),
    webResearch: z.boolean().optional().default(false),
  })
  .strict();

/** Agent 会话资源路径参数。 */
export const AgentSessionParamsSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

/** 恢复等待中 Graph 的文本输入请求。 */
export const AgentInputSchema = z
  .object({
    inputId: StableOperationIdSchema,
    type: z.literal("text"),
    content: z.string().trim().min(1).max(5000),
  })
  .strict();

/** 打断当前 Agent 输出或语音播放的请求。 */
export const AgentInterruptSchema = z
  .object({
    operationId: StableOperationIdSchema.optional(),
    turnId: StableOperationIdSchema.optional(),
    reason: z
      .enum(["user_requested", "barge_in"])
      .optional()
      .default("user_requested"),
  })
  .strict();

/** 主动结束 Agent 会话的请求。 */
export const AgentFinishSchema = z
  .object({
    operationId: StableOperationIdSchema.optional(),
  })
  .strict();

/** 重试最近失败节点的请求。 */
export const AgentRetrySchema = z
  .object({
    operationId: StableOperationIdSchema.optional(),
    force: z.boolean().optional().default(false),
  })
  .strict();

/** Checkpoint 中允许持久化的无凭据冻结配置。 */
export const FrozenAgentConfigSchema: z.ZodType<FrozenAgentConfig> = z
  .object({
    interviewMode: z.enum(["text", "voice"]),
    position: z.string().trim().min(1).max(100),
    difficulty: z.enum(["初级", "中级", "高级"]),
    questionCount: z.number().int().min(3).max(10),
    jobDescription: z.string().max(2000).nullable(),
    targetCompany: z.string().max(100).nullable(),
    skillId: z.string().min(1).max(100).nullable(),
    resumeId: z.string().uuid().nullable(),
    modelProvider: z.enum(["deepseek", "openai", "anthropic"]),
    modelName: z.string().trim().min(1).max(100),
    webResearch: z.boolean(),
    promptVersion: z.string().trim().min(1).max(100),
  })
  .strict();

/** Checkpoint 中冻结的单个角色阶段。 */
export const RoleStageSchema: z.ZodType<RoleStage> = z
  .object({
    stageIndex: z.number().int().min(0),
    roleId: z.enum(["general", "technical", "manager", "hr"]),
    questionCount: z.number().int().positive(),
    startQuestionIndex: z.number().int().min(0),
    endQuestionIndex: z.number().int().min(0),
  })
  .strict()
  .refine(
    (stage) =>
      stage.endQuestionIndex - stage.startQuestionIndex + 1 ===
      stage.questionCount,
    "Role stage range must match questionCount",
  );

/**
 * 从 LangGraph invoke/getState 边界恢复核心状态。
 *
 * Zod 默认剥离 `__interrupt__` 等 LangGraph 运行元数据，只保留显式状态 channel；
 * 冻结配置本身保持 strict，从而拒绝凭据或未知配置字段。
 */
export const InterviewAgentStateSchema: z.ZodType<InterviewAgentState> = z
  .object({
    version: z.literal("agent-v1"),
    sessionId: z.string().uuid(),
    userId: z.string().uuid(),
    mode: z.enum(["single", "panel"]),
    phase: z.enum([
      "preparing",
      "awaiting_answer",
      "reasoning",
      "speaking",
      "scoring",
      "role_handoff",
      "reporting",
      "completed",
      "failed",
    ]),
    config: FrozenAgentConfigSchema,
    rolePlan: z.array(RoleStageSchema).min(1).max(3),
    currentRole: z.enum(["general", "technical", "manager", "hr"]),
    currentQuestionId: z.string().trim().min(1).max(200).nullable(),
    currentQuestionIndex: z.number().int().min(0).max(9),
    followUpCount: z.number().int().min(0).max(3),
    coveredDimensions: z.array(z.string().trim().min(1).max(100)).max(100),
    latestInputId: StableOperationIdSchema.nullable(),
    latestEvidenceIds: z.array(z.string().uuid()).max(100),
    pendingAction: z.enum(["ask", "follow_up", "score", "handoff", "finish"]),
  })
  .refine(
    (state) => state.currentQuestionIndex < state.config.questionCount,
    "Current question index exceeds frozen question count",
  );

/** 创建 Agent 会话的已校验请求。 */
export type CreateAgentSessionInput = z.infer<typeof CreateAgentSessionSchema>;

/** Agent 会话资源的已校验路径参数。 */
export type AgentSessionParamsInput = z.infer<typeof AgentSessionParamsSchema>;

/** 恢复 Graph 的已校验文本输入。 */
export type AgentInput = z.infer<typeof AgentInputSchema>;

/** 已校验的输出打断请求。 */
export type AgentInterruptInput = z.infer<typeof AgentInterruptSchema>;

/** 已校验的主动结束请求。 */
export type AgentFinishInput = z.infer<typeof AgentFinishSchema>;

/** 已校验的失败节点重试请求。 */
export type AgentRetryInput = z.infer<typeof AgentRetrySchema>;
