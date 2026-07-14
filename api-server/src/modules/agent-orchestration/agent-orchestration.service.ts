/** Agent Orchestration Service：规划、动态工具、反思和回答决策闭环。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { createHash } from "node:crypto";
import { getBrainDocumentIds } from "../knowledge/brain/brain.repository.js";
import { searchKnowledge } from "../knowledge/search.service.js";
import type { InterviewAgentTools } from "../interview-agent/tools/interview-agent.tools.js";
import type { WebSearchProvider } from "../interview-agent/providers/web-search.provider.js";
import { sanitizeWebText } from "../interview-agent/providers/web-search.provider.js";
import type { AgentMemoryService } from "../agent-memory/agent-memory.service.js";
import type { AgentOrchestrationModel } from "./agent-orchestration.provider.js";
import type { AgentOrchestrationRepository } from "./agent-orchestration.repository.js";
import type { AgentPlanningContext, AgentReflectionContext, AgentResponseContext, AgentStrategyDraft, AgentStrategyReceipt, AgentToolRequest, AgentOrchestrationRunner } from "./agent-orchestration.types.js";
import type { AgentResponseDecision } from "../interview-agent/interview-agent.types.js";

/** 动态工具执行依赖。 */
export type AgentOrchestrationDependencies = {
  repository: AgentOrchestrationRepository;
  model: AgentOrchestrationModel;
  tools: InterviewAgentTools;
  webSearch: WebSearchProvider;
  memory: AgentMemoryService;
  supabase: UserSupabaseClient;
};

/** 过滤模型提出的越权或当前不可用工具。 */
function authorizeRequests(input: AgentPlanningContext, requests: AgentToolRequest[], budget: number): AgentToolRequest[] {
  const seen = new Set<string>();
  return requests.filter((request) => {
    if (seen.has(request.name)) return false;
    seen.add(request.name);
    if (request.name === "web_search" && !input.webResearch) return false;
    if (request.name === "search_knowledge" && !input.brainId) return false;
    if (request.name === "load_training_profile" && !input.useTrainingMemory) return false;
    return true;
  }).slice(0, budget);
}

/** 受控 Agent v2 编排服务。 */
export class AgentOrchestrationService implements AgentOrchestrationRunner {
  /** @param dependencies - 模型、持久化、白名单工具和用户作用域数据源。 */
  constructor(private readonly dependencies: AgentOrchestrationDependencies) {}

  /** Planner 非法时只修复一次，再使用确定性安全策略。 */
  private async draftPlan(input: AgentPlanningContext, reflection?: { input: AgentReflectionContext; scores: Record<string, { score: number }> }): Promise<AgentStrategyDraft> {
    for (const repair of [false, true]) {
      try {
        const draft = reflection
          ? await this.dependencies.model.reflect(reflection.input, reflection.scores, repair)
          : await this.dependencies.model.plan(input, repair);
        const allowed = new Set(input.allowedDimensions);
        const focusDimensions = draft.focusDimensions.filter((key) => allowed.has(key));
        if (focusDimensions.length === 0) throw new Error("strategy dimensions are outside the frozen blueprint");
        return { ...draft, focusDimensions };
      } catch {
        if (repair) break;
      }
    }
    return {
      objective: `围绕 ${input.position} 收集可验证的能力证据`,
      focusDimensions: input.allowedDimensions.slice(0, 3),
      questionIntent: "通过具体经历、行动和结果验证候选人的真实能力",
      toolRequests: [],
      activityLabel: reflection ? "已使用安全策略调整后续问题" : "已使用安全策略制定面试计划",
    };
  }

  /** 执行一个只读工具并只返回引用数量与安全观察 ID。 */
  private async executeTool(input: AgentPlanningContext, request: AgentToolRequest): Promise<{ id: string; sourceCount: number; memoryApplied: boolean; brainApplied: boolean }> {
    const started = performance.now();
    const resultReferences: string[] = [];
    let sourceCount = 0;
    let memoryApplied = false;
    let brainApplied = false;
    let status: "completed" | "skipped" | "failed" = "completed";
    try {
      if (request.name === "search_question_bank") {
        const results = await this.dependencies.tools.searchQuestionBank({ position: input.position, difficulty: input.difficulty as "初级" | "中级" | "高级", limit: 10 });
        sourceCount = results.length;
        resultReferences.push(...results.map((item) => item.id));
      } else if (request.name === "web_search") {
        if (!this.dependencies.webSearch.available) status = "skipped";
        else {
          const results = await this.dependencies.webSearch.search({ query: `${input.targetCompany ?? ""} ${input.position} ${sanitizeWebText(request.focus, 100)}`.trim(), maxResults: 5 });
          sourceCount = results.length;
          resultReferences.push(...results.map((item) => item.contentHash));
        }
      } else if (request.name === "search_knowledge" && input.brainId) {
        const documentIds = await getBrainDocumentIds(this.dependencies.supabase, input.brainId);
        if (documentIds.length === 0) status = "skipped";
        else {
          const results = await searchKnowledge(this.dependencies.supabase, input.userId, request.focus, { documentIds, topK: 5 });
          sourceCount = results.length;
          resultReferences.push(...results.map((item) => item.chunkId));
          await this.dependencies.repository.recordKnowledgeCitations(input.sessionId, results.map((result) => ({
            brainId: input.brainId!, documentId: result.documentId, chunkId: result.chunkId,
            title: result.documentTitle.slice(0, 300), snippet: sanitizeWebText(result.content, 1_000),
            similarity: Math.max(0, Math.min(1, result.similarity)),
          })));
          brainApplied = sourceCount > 0;
        }
      } else if (request.name === "load_session_messages") {
        const results = await this.dependencies.tools.loadSessionMessages(input.sessionId);
        sourceCount = results.length;
        resultReferences.push(...results);
      } else if (request.name === "load_training_profile") {
        const profile = await this.dependencies.memory.get(input.userId);
        memoryApplied = input.useTrainingMemory && profile.enabled && profile.summary !== null;
        sourceCount = memoryApplied ? 1 : 0;
        if (memoryApplied) resultReferences.push(profile.updatedAt ?? "training-profile");
        if (!memoryApplied) status = "skipped";
      } else status = "skipped";
    } catch {
      status = "failed";
    }
    const id = await this.dependencies.repository.recordActivity(input.sessionId, {
      kind: "tool", status, label: request.name === "search_knowledge" ? "检索已绑定知识库" : request.name === "web_search" ? "检索岗位与公司资料" : request.name === "load_training_profile" ? "读取历史训练摘要" : "读取面试参考上下文",
      reasonCode: request.reasonCode, sourceCount,
      toolName: request.name,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      resultHash: createHash("sha256").update(JSON.stringify(resultReferences.sort())).digest("hex"),
      resultSummary: `${status}:${sourceCount}`,
    });
    return { id, sourceCount, memoryApplied, brainApplied };
  }

  /** 持久化策略，执行审批后的工具并返回仅含引用的回执。 */
  private async commitAndExecute(input: AgentPlanningContext, draft: AgentStrategyDraft, kind: "planning" | "reflection", budget: number): Promise<AgentStrategyReceipt> {
    const requests = authorizeRequests(input, draft.toolRequests, budget);
    let memoryApplied = false;
    let brainApplied = false;
    const observations: string[] = [];
    for (const request of requests) {
      const result = await this.executeTool(input, request);
      observations.push(result.id);
      memoryApplied ||= result.memoryApplied;
      brainApplied ||= result.brainApplied;
    }
    const committed = await this.dependencies.repository.commitStrategy({ sessionId: input.sessionId, kind, draft: { ...draft, toolRequests: requests }, memoryApplied, brainApplied });
    await this.dependencies.repository.recordActivity(input.sessionId, {
      kind, status: "completed", label: draft.activityLabel,
      reasonCode: kind === "planning" ? "initial_strategy" : "score_gap_replan",
    });
    return { strategyRevisionId: committed.id, revision: committed.revision, questionIntent: draft.questionIntent, observationIds: observations, memoryApplied, brainApplied };
  }

  /** @inheritdoc */
  async planSession(input: AgentPlanningContext): Promise<AgentStrategyReceipt> {
    return this.commitAndExecute(input, await this.draftPlan(input), "planning", 3);
  }

  /** @inheritdoc */
  async reflect(input: AgentReflectionContext): Promise<AgentStrategyReceipt> {
    const scores = await this.dependencies.repository.getLatestEvaluation(input.sessionId) ?? {};
    const draft = await this.draftPlan(input, { input, scores });
    return this.commitAndExecute(input, draft, "reflection", 1);
  }

  /** @inheritdoc */
  async decideResponse(input: AgentResponseContext): Promise<AgentResponseDecision> {
    if (input.followUpCount >= 3) return { action: "score", reasonCode: "follow_up_limit", followUpQuestion: null };
    for (const repair of [false, true]) {
      try {
        return await this.dependencies.model.decide(input, repair);
      } catch {
        if (repair) break;
      }
    }
    return { action: input.answer.trim().length >= 80 ? "score" : "follow_up", reasonCode: "deterministic_fallback", followUpQuestion: input.answer.trim().length >= 80 ? null : "请补充一个具体场景，并说明你的行动和最终结果。" };
  }

  /** @inheritdoc */
  async updateTrainingMemory(sessionId: string, userId: string): Promise<boolean> {
    const scores = await this.dependencies.repository.getReportDimensions(sessionId);
    if (!scores) return false;
    const updated = await this.dependencies.memory.mergeReport(userId, { dimensions: scores });
    await this.dependencies.repository.recordActivity(sessionId, { kind: "memory", status: updated ? "completed" : "skipped", label: updated ? "已更新长期训练摘要" : "未使用长期训练记忆", reasonCode: updated ? "memory_updated" : "memory_not_authorized" });
    return updated;
  }
}
