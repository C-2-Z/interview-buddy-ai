/** Interview Agent 使用现有多模型、用户设置和结构化 Prompt 的生产 Adapter。 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { callAI, type ChatMessage } from "../../../shared/ai/ai-client.js";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import { resolveProviderForCreation } from "../../model-providers/model-provider.service.js";
import type {
  AgentFollowUpModelInput,
  AgentInterviewerModelProvider,
  AgentModelProvider,
  AgentQuestionModelInput,
  AgentQuestionModelOutput,
} from "./agent-model.provider.js";
import type { AgentRunAuditor } from "../audit/agent-run.repository.js";
import { executeAuditedModelCall } from "../audit/agent-run.service.js";

const QuestionOutputSchema = z.object({ question: z.string().trim().min(5).max(1_000) }).strict();
const FollowUpOutputSchema = z.object({ question: z.string().trim().min(5).max(500) }).strict();

/** 移除常见 Markdown fence 后解析严格 JSON。 */
function parseStructuredOutput<T>(schema: z.ZodType<T>, text: string): T {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return schema.parse(JSON.parse(normalized));
}

/** 生产 Adapter 可替换依赖，测试不会访问网络或用户设置。 */
export type ProductionAgentModelDependencies = {
  /** 当前用户 Supabase client。 */
  supabase: UserSupabaseClient;
  /** 已鉴权用户 UUID。 */
  userId: string;
  /** 可替换 Provider 解析器。 */
  resolveProvider?: typeof resolveProviderForCreation;
  /** 可替换模型调用。 */
  complete?: typeof callAI;
  /** 可选运行审计器。 */
  auditor?: AgentRunAuditor;
};

/** 复用项目多模型/BYOK 配置的题目和追问 Adapter。 */
export class ProductionAgentModelProvider
  implements AgentModelProvider, AgentInterviewerModelProvider {
  private readonly resolveProvider: typeof resolveProviderForCreation;
  private readonly complete: typeof callAI;

  /** @param dependencies - 用户作用域数据库与可替换 AI 依赖。 */
  constructor(private readonly dependencies: ProductionAgentModelDependencies) {
    this.resolveProvider = dependencies.resolveProvider ?? resolveProviderForCreation;
    this.complete = dependencies.complete ?? callAI;
  }

  /**
   * 使用冻结供应商和模型解析用户 BYOK，但 Key 只停留在调用栈。
   *
   * @param input - 冻结供应商和模型名称。
   * @returns 当前用户可用的模型 Provider；API Key 不会复制到业务对象。
   */
  private resolve(input: { modelProvider?: "deepseek" | "openai" | "anthropic"; modelName?: string }) {
    return this.resolveProvider(this.dependencies.supabase, this.dependencies.userId, {
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
  }

  /** @inheritdoc */
  async generateQuestion(input: AgentQuestionModelInput, signal?: AbortSignal): Promise<AgentQuestionModelOutput> {
    const provider = await this.resolve(input);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          `你是${input.persona.displayName}。`,
          `语气：${input.persona.tone}`,
          `允许主题：${input.persona.allowedTopics.join("、")}`,
          `禁止行为：${input.persona.prohibitedBehaviors.join("、")}`,
          "只输出严格 JSON：{\"question\":\"一道面试题\"}。",
          "不得提供答案、评分、题量或流程指令。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `岗位：${input.position}`,
          `难度：${input.difficulty}`,
          `题号：${input.questionIndex + 1}`,
          `主维度：${input.dimensionKey ?? "综合能力"}`,
          `策略意图：${input.strategyIntent ?? "按主维度收集具体证据"}`,
          `岗位描述：${input.trustedContext?.jobDescription ?? "未提供"}`,
          input.untrustedResearchContext ?? "",
        ].filter(Boolean).join("\n"),
      },
    ];
    const text = await executeAuditedModelCall({
      auditor: this.dependencies.auditor,
      sessionId: input.sessionId,
      operationKey: `model:question:${input.questionIndex}`,
      nodeName: "select_question",
      modelProvider: provider.name,
      modelName: provider.model,
      promptVersion: input.promptVersion,
    }, (onUsage) => this.complete(messages, provider, {
      taskProfile: "generation", outputMode: "json", maxTokens: 800,
      thinkingMode: "disabled", signal, traceId: `${input.sessionId}:question:${input.questionIndex}`, onUsage,
    }));
    const output = parseStructuredOutput(QuestionOutputSchema, text);
    const hash = createHash("sha256")
      .update(`${input.sessionId}\0${input.questionIndex}\0${output.question}`)
      .digest("hex")
      .slice(0, 32);
    return {
      questionId: `model:${hash}`,
      content: output.question,
      modelProvider: provider.name,
      modelName: provider.model,
      promptVersion: input.promptVersion,
    };
  }

  /** @inheritdoc */
  async generateFollowUp(input: AgentFollowUpModelInput, signal?: AbortSignal): Promise<{ content: string }> {
    const provider = await this.resolve(input);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          `你是${input.persona.displayName}，${input.persona.tone}`,
          "根据代码给出的证据缺口，只问一句聚焦追问。",
          "不得回答原题、暗示标准答案、评分或改变面试流程。",
          "只输出严格 JSON：{\"question\":\"追问\"}。",
        ].join("\n"),
      },
      {
        role: "user",
        content: `原题：${input.question}\n候选人回答：${input.answer}\n证据缺口：${input.evidenceGap}\n追问轮次：${input.followUpNumber}/3`,
      },
    ];
    const text = await executeAuditedModelCall({
      auditor: this.dependencies.auditor,
      sessionId: input.sessionId,
      operationKey: `model:follow-up:${input.followUpNumber}`,
      nodeName: "interviewer_respond",
      modelProvider: provider.name,
      modelName: provider.model,
      promptVersion: input.promptVersion,
    }, (onUsage) => this.complete(messages, provider, {
      taskProfile: "interactive", outputMode: "json", maxTokens: 300,
      thinkingMode: "disabled", signal, traceId: `${input.sessionId}:follow-up:${input.followUpNumber}`, onUsage,
    }));
    const output = parseStructuredOutput(FollowUpOutputSchema, text);
    return { content: output.question };
  }
}

/** 创建绑定当前用户设置的生产模型 Adapter。 */
export function createProductionAgentModelProvider(
  supabase: UserSupabaseClient,
  userId: string,
  auditor?: AgentRunAuditor,
): ProductionAgentModelProvider {
  return new ProductionAgentModelProvider({ supabase, userId, auditor });
}
