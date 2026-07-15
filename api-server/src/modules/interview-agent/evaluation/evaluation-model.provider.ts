/** Interview Agent Phase 4 复用多模型/BYOK 的证据提取与评分 Adapter。 */
import { callAI } from "../../../shared/ai/ai-client.js";
import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import { resolveProviderForCreation } from "../../model-providers/model-provider.service.js";
import {
  ModelEvaluationOutputSchema,
  ModelEvidenceOutputSchema,
  type ModelEvaluationOutput,
  type ModelEvidenceOutput,
} from "./evaluation.schemas.js";
import type { AnswerEvidenceDraft, QuestionEvaluationContext } from "./evaluation.types.js";
import type { AgentEvaluationModelProvider } from "./evaluation.service.js";
import type { AgentRunAuditor } from "../audit/agent-run.repository.js";
import { executeAuditedModelCall } from "../audit/agent-run.service.js";

/** 清理 Markdown fence 并解析 JSON。 */
function parseJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

/** 生产评分模型可替换依赖。 */
export type EvaluationModelDependencies = {
  /** 用户作用域 Supabase client。 */ supabase: UserSupabaseClient;
  /** 已鉴权用户 UUID。 */ userId: string;
  /** 测试可替换 Provider 解析器。 */ resolveProvider?: typeof resolveProviderForCreation;
  /** 测试可替换模型调用。 */ complete?: typeof callAI;
  /** 可选运行审计器。 */ auditor?: AgentRunAuditor;
};

/** 真实模型证据与评分 Adapter。 */
export class ProductionAgentEvaluationModelProvider implements AgentEvaluationModelProvider {
  private readonly resolveProvider: typeof resolveProviderForCreation;
  private readonly complete: typeof callAI;

  /** @param dependencies - 用户数据库与多模型调用依赖。 */
  constructor(private readonly dependencies: EvaluationModelDependencies) {
    this.resolveProvider = dependencies.resolveProvider ?? resolveProviderForCreation;
    this.complete = dependencies.complete ?? callAI;
  }

  /** 按冻结配置解析 BYOK，Key 不进入返回对象之外的业务结构。 */
  private resolve(context: QuestionEvaluationContext) {
    return this.resolveProvider(this.dependencies.supabase, this.dependencies.userId, {
      modelProvider: context.modelProvider,
      modelName: context.modelName,
    });
  }

  /** @inheritdoc */
  async extractEvidence(context: QuestionEvaluationContext): Promise<ModelEvidenceOutput> {
    const provider = await this.resolve(context);
    const messages = [
      {
        role: "system",
        content: [
          "只从候选人消息提取可核验事实，不得引用面试官内容或补充常识。",
          "quote 必须逐字出现在对应 message.content 中；dimensionKey 只能来自允许列表。",
          "没有证据时返回空 evidence。只输出严格 JSON。",
          '{"evidence":[{"messageId":"UUID","dimensionKey":"KEY","claim":"事实","quote":"原文","polarity":"positive|negative|neutral","confidence":0.0}]}',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          question: context.question,
          allowedDimensions: context.rubric.map((dimension) => dimension.key),
          candidateMessages: context.messages,
        }),
      },
    ] as const;
    const text = await executeAuditedModelCall({
      auditor: this.dependencies.auditor,
      sessionId: context.sessionId,
      operationKey: `model:evidence:${context.questionId}`,
      nodeName: "extract_evidence",
      modelProvider: provider.name,
      modelName: provider.model,
      promptVersion: context.promptVersion,
    }, (onUsage) => this.complete([...messages], provider, {
      taskProfile: "evaluation", outputMode: "json", maxTokens: 2_000,
      thinkingMode: "disabled", traceId: `${context.sessionId}:evidence:${context.questionId}`,
      onUsage,
    }));
    return ModelEvidenceOutputSchema.parse(parseJson(text));
  }

  /** @inheritdoc */
  async evaluate(
    context: QuestionEvaluationContext,
    evidence: readonly AnswerEvidenceDraft[],
    repair: boolean,
  ): Promise<ModelEvaluationOutput> {
    const provider = await this.resolve(context);
    const messages = [
      {
        role: "system",
        content: [
          "按冻结量表逐维度输出 status、score、rationale、evidenceIds，只能引用该维度提供的候选人原文证据。",
          "有证据时 status=scored 且 score 为 0-100 整数；无证据时 status=not_observed、score=null、evidenceIds=[]。",
          "主维度无证据的 0 分规则由服务端执行，不要用常识补全候选人能力。",
          "不得输出 overallScore；它由代码按权重计算。只输出严格 JSON。",
          repair ? "这是唯一修复尝试：严格补齐全部维度并移除非法引用。" : "首次评分。",
          '{"dimensions":{"KEY":{"status":"scored|not_observed","score":0,"rationale":"理由","evidenceIds":[]}},"feedback":"反馈"}',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          question: context.question,
          rubric: context.rubric,
          evidence,
        }),
      },
    ] as const;
    const attempt = repair ? "repair" : "first";
    const text = await executeAuditedModelCall({
      auditor: this.dependencies.auditor,
      sessionId: context.sessionId,
      operationKey: `model:evaluation:${context.questionId}:${attempt}`,
      nodeName: "score_question",
      modelProvider: provider.name,
      modelName: provider.model,
      promptVersion: context.promptVersion,
    }, (onUsage) => this.complete([...messages], provider, {
      taskProfile: "evaluation", outputMode: "json", maxTokens: 3_000,
      thinkingMode: "disabled", traceId: `${context.sessionId}:evaluation:${context.questionId}:${attempt}`,
      onUsage,
    }));
    return ModelEvaluationOutputSchema.parse(parseJson(text));
  }
}

/** 创建绑定当前用户设置的评分模型 Adapter。 */
export function createAgentEvaluationModelProvider(
  supabase: UserSupabaseClient,
  userId: string,
  auditor?: AgentRunAuditor,
): AgentEvaluationModelProvider {
  return new ProductionAgentEvaluationModelProvider({ supabase, userId, auditor });
}
