/** Agent Orchestration 多模型 Planner、Reflection 与回答决策 Adapter。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { callAI, type ChatMessage } from "../../shared/ai/ai-client.js";
import { resolveProviderForCreation } from "../model-providers/model-provider.service.js";
import type { AgentRunAuditor } from "../interview-agent/audit/agent-run.repository.js";
import { executeAuditedModelCall } from "../interview-agent/audit/agent-run.service.js";
import { AgentResponseDecisionSchema, AgentStrategyDraftSchema } from "./agent-orchestration.schemas.js";
import type { AgentPlanningContext, AgentReflectionContext, AgentResponseContext, AgentStrategyDraft } from "./agent-orchestration.types.js";
import type { AgentResponseDecision } from "../interview-agent/interview-agent.types.js";

/** 模型编排端口，测试可注入确定性实现。 */
export interface AgentOrchestrationModel {
  plan(input: AgentPlanningContext, repair?: boolean): Promise<AgentStrategyDraft>;
  reflect(input: AgentReflectionContext, scores: Record<string, { score: number }>, repair?: boolean): Promise<AgentStrategyDraft>;
  decide(input: AgentResponseContext, repair?: boolean): Promise<AgentResponseDecision>;
}

/** 移除 Markdown fence 并解析严格 JSON。 */
function parseJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

/** 生产编排模型，继续复用项目多模型和 BYOK 设置。 */
export class ProductionAgentOrchestrationModel implements AgentOrchestrationModel {
  /** @param supabase - 用户作用域数据库。 @param userId - 鉴权用户。 @param auditor - 脱敏模型审计。 */
  constructor(
    private readonly supabase: UserSupabaseClient,
    private readonly userId: string,
    private readonly auditor?: AgentRunAuditor,
  ) {}

  /** 调用冻结 Provider，并记录不含 Prompt 的审计元数据。 */
  private async complete(
    input: AgentPlanningContext,
    operationKey: string,
    nodeName: string,
    messages: ChatMessage[],
  ): Promise<string> {
    const provider = await resolveProviderForCreation(this.supabase, this.userId, {
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
    return executeAuditedModelCall({
      auditor: this.auditor, sessionId: input.sessionId, operationKey, nodeName,
      modelProvider: provider.name, modelName: provider.model, promptVersion: input.promptVersion,
    }, (onUsage) => callAI(messages, provider, {
      taskProfile: "generation", outputMode: "json", maxTokens: 900,
      thinkingMode: "disabled", traceId: `${input.sessionId}:${operationKey}`, onUsage,
    }));
  }

  /** @inheritdoc */
  async plan(input: AgentPlanningContext, repair = false): Promise<AgentStrategyDraft> {
    const messages: ChatMessage[] = [{ role: "system", content: [
      "你是受控面试策略规划器，只制定战术计划，不改变题量、角色、评分和结束条件。",
      "可选工具仅限 search_question_bank、web_search、search_knowledge、load_session_messages、load_training_profile。",
      "只有绑定 Brain 才能选择 search_knowledge；只有用户请求长期记忆才能选择 load_training_profile。",
      "questionCriteria 必须包含 primaryDimension、topicKeys、evidenceGoalKeys、questionIntent，且主维度来自 allowedDimensions。",
      "只输出严格 JSON：objective、focusDimensions、questionIntent、questionCriteria、toolRequests、activityLabel。",
      repair ? "上次输出未通过 Schema；本次必须移除所有额外字段。" : "",
    ].filter(Boolean).join("\n") }, { role: "user", content: JSON.stringify({
      position: input.position, difficulty: input.difficulty, targetCompany: input.targetCompany,
      jobDescription: input.jobDescription,
      resumeSummary: input.resumeSummary,
      researchContext: input.researchContext,
      allowedDimensions: input.allowedDimensions, capabilities: {
        webResearch: input.webResearch, brainBound: input.brainId !== null,
        trainingMemoryRequested: input.useTrainingMemory,
      },
    }) }];
    const text = await this.complete(input, repair ? "model:plan:repair" : "model:plan:initial", "plan_session", messages);
    return AgentStrategyDraftSchema.parse(parseJson(text));
  }

  /** @inheritdoc */
  async reflect(input: AgentReflectionContext, scores: Record<string, { score: number }>, repair = false): Promise<AgentStrategyDraft> {
    const messages: ChatMessage[] = [{ role: "system", content: [
      "你是受控面试反思器。根据冻结评分修订下一题战术，不得改变角色顺序、题量、评分权重或结束条件。",
      "focusDimensions 必须来自 allowedDimensions；toolRequests 最多一个。",
      "questionCriteria 必须包含 primaryDimension、topicKeys、evidenceGoalKeys、questionIntent。",
      "只输出严格 JSON：objective、focusDimensions、questionIntent、questionCriteria、toolRequests、activityLabel。",
      repair ? "上次输出非法；本次必须严格符合结构。" : "",
    ].filter(Boolean).join("\n") }, { role: "user", content: JSON.stringify({
      questionIndex: input.currentQuestionIndex, currentRole: input.currentRole,
      allowedDimensions: input.allowedDimensions, latestScores: scores,
      capabilities: { webResearch: input.webResearch, brainBound: input.brainId !== null, trainingMemoryRequested: input.useTrainingMemory },
    }) }];
    const text = await this.complete(input, repair ? `model:reflect:${input.currentQuestionIndex}:repair` : `model:reflect:${input.currentQuestionIndex}`, "reflect_and_replan", messages);
    const draft = AgentStrategyDraftSchema.parse(parseJson(text));
    return { ...draft, toolRequests: draft.toolRequests.slice(0, 1) };
  }

  /** @inheritdoc */
  async decide(input: AgentResponseContext, repair = false): Promise<AgentResponseDecision> {
    const planningInput: AgentPlanningContext = {
      ...input, userId: this.userId, position: "interview", difficulty: "controlled",
      targetCompany: null, brainId: null, useTrainingMemory: false, webResearch: false,
      allowedDimensions: [],
    };
    const messages: ChatMessage[] = [{ role: "system", content: [
      "你是受控面试官决策器。判断回答是否已有足够事实证据进入评分。",
      "若追问，必须同时给出一句聚焦问题；若评分，followUpQuestion 必须为 null。",
      "必须对照 evidenceGoals 返回 coveredEvidenceGoals 与 missingEvidenceGoals，禁止重复询问已覆盖目标。",
      "不得给答案、评分或改变流程。只输出严格 JSON：action、reasonCode、followUpQuestion、coveredEvidenceGoals、missingEvidenceGoals。",
      repair ? "上次输出非法；本次必须严格符合结构。" : "",
    ].filter(Boolean).join("\n") }, { role: "user", content: JSON.stringify({
      question: input.question, conversation: input.conversation, evidenceGoals: input.evidenceGoals,
      latestAnswer: input.answer, roleId: input.roleId,
      followUpCount: input.followUpCount, remainingFollowUps: Math.max(0, 3 - input.followUpCount),
    }) }];
    const text = await this.complete(planningInput, repair ? `model:decision:${input.followUpCount}:repair` : `model:decision:${input.followUpCount}`, "decide_response", messages);
    return AgentResponseDecisionSchema.parse(parseJson(text));
  }
}
