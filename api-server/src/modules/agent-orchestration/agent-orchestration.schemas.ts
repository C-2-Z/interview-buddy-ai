/** Agent Orchestration 模型输出、HTTP 参数和工具请求的严格 Schema。 */
import { z } from "zod";

/** 模型只能从固定只读工具表选择。 */
export const AgentOptionalToolNameSchema = z.enum([
  "search_question_bank",
  "web_search",
  "search_knowledge",
  "load_session_messages",
  "load_training_profile",
]);

/** 单个动态工具请求。 */
export const AgentToolRequestSchema = z.object({
  name: AgentOptionalToolNameSchema,
  focus: z.string().trim().min(1).max(200),
  reasonCode: z.string().trim().min(1).max(100),
}).strict();

/** Planner 交给选题器的结构化标准。 */
export const AgentQuestionCriteriaSchema = z.object({
  primaryDimension: z.string().trim().min(1).max(100),
  topicKeys: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
  evidenceGoalKeys: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
  questionIntent: z.string().trim().min(5).max(500),
}).strict();

/** Planner 和 Reflection 共用的结构化策略输出。 */
export const AgentStrategyDraftSchema = z.object({
  objective: z.string().trim().min(5).max(300),
  focusDimensions: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
  questionIntent: z.string().trim().min(5).max(500),
  questionCriteria: AgentQuestionCriteriaSchema,
  toolRequests: z.array(AgentToolRequestSchema).max(3),
  activityLabel: z.string().trim().min(2).max(100),
}).strict();

/** 有效回答的结构化分支决策。 */
export const AgentResponseDecisionSchema = z.object({
  action: z.enum(["follow_up", "score"]),
  reasonCode: z.string().trim().min(1).max(100),
  followUpQuestion: z.string().trim().min(5).max(500).nullable(),
  coveredEvidenceGoals: z.array(z.string().trim().min(1).max(100)).max(8),
  missingEvidenceGoals: z.array(z.string().trim().min(1).max(100)).max(8),
}).strict().superRefine((value, context) => {
  if ((value.action === "follow_up") !== (value.followUpQuestion !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "follow-up text must match action" });
  }
});

/** Activities 路径参数。 */
export const AgentActivitiesParamsSchema = z.object({ sessionId: z.string().uuid() }).strict();
