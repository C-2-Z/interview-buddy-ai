/** Interview Agent Phase 4 证据校验、一次评分修复与代码加权服务。 */
import { randomUUID } from "node:crypto";
import type {
  AnswerEvidenceDraft,
  CommitQuestionEvaluationInput,
  QuestionEvaluation,
  QuestionEvaluationContext,
  QuestionEvaluationReceipt,
} from "./evaluation.types.js";
import type {
  ModelEvaluationOutput,
  ModelEvidenceOutput,
} from "./evaluation.schemas.js";

/** 证据与评分模型端口。 */
export interface AgentEvaluationModelProvider {
  /** 从候选人消息提取结构化证据。 */
  extractEvidence(context: QuestionEvaluationContext): Promise<ModelEvidenceOutput>;
  /** 只依据冻结量表和已验证证据评分；repair=true 表示唯一修复尝试。 */
  evaluate(
    context: QuestionEvaluationContext,
    evidence: readonly AnswerEvidenceDraft[],
    repair: boolean,
  ): Promise<ModelEvaluationOutput>;
}

/** 评分持久化端口。 */
export interface AgentEvaluationRepository {
  /** 加载当前题目、冻结量表和候选人消息。 */
  loadContext(sessionId: string, questionId: string): Promise<QuestionEvaluationContext>;
  /** 原子提交证据、评分、旧表投影和事件。 */
  commitEvaluation(input: CommitQuestionEvaluationInput): Promise<QuestionEvaluationReceipt>;
  /** 第二次非法输出后记录稳定失败状态，不保存模型原始文本。 */
  markEvaluationFailed(sessionId: string, questionId: string): Promise<void>;
}

/** Graph score_question 节点依赖的最小评分端口。 */
export interface QuestionEvaluationRunner {
  /** 提取、评分并提交当前题目。 */
  evaluateAndCommit(sessionId: string, questionId: string): Promise<QuestionEvaluationReceipt>;
}

/**
 * 验证模型证据只引用本题候选人原文和冻结维度，并由服务生成 UUID。
 *
 * @param context - 冻结题目、量表和候选人消息。
 * @param output - 已通过基础 Zod 的模型输出。
 * @returns 可写入业务表的证据；没有合法证据时返回空数组。
 */
export function validateExtractedEvidence(
  context: QuestionEvaluationContext,
  output: ModelEvidenceOutput,
): AnswerEvidenceDraft[] {
  const messages = new Map(context.messages.map((message) => [message.id, message.content]));
  const dimensions = new Set(context.rubric.map((dimension) => dimension.key));
  const seen = new Set<string>();
  const evidence: AnswerEvidenceDraft[] = [];
  for (const item of output.evidence) {
    const content = messages.get(item.messageId);
    const signature = `${item.messageId}\0${item.dimensionKey}\0${item.quote}`;
    if (!content || !dimensions.has(item.dimensionKey) || !content.includes(item.quote) || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    evidence.push({ id: randomUUID(), ...item });
  }
  return evidence;
}

/**
 * 校验维度集合和证据引用，并以冻结权重计算总分。
 *
 * @param context - 冻结量表和模型审计配置。
 * @param evidence - 已验证证据。
 * @param output - 模型评分输出。
 * @returns 代码计算 overallScore 的版本化评分。
 */
export function buildQuestionEvaluation(
  context: QuestionEvaluationContext,
  evidence: readonly AnswerEvidenceDraft[],
  output: ModelEvaluationOutput,
): QuestionEvaluation {
  const expected = context.rubric.map((dimension) => dimension.key).sort();
  const actual = Object.keys(output.dimensions).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("Evaluation dimensions do not match the frozen rubric");
  }
  const evidenceIds = new Set(evidence.map((item) => item.id));
  let weighted = 0;
  let totalWeight = 0;
  for (const dimension of context.rubric) {
    const result = output.dimensions[dimension.key];
    if (!result || result.evidenceIds.some((id) => !evidenceIds.has(id))) {
      throw new Error("Evaluation references unknown evidence");
    }
    // 无证据维度必须显式写“证据不足”，避免模型用常识补全候选人能力。
    if (result.evidenceIds.length === 0 && !/证据不足|insufficient evidence/i.test(result.rationale)) {
      throw new Error("Evidence-free dimension must be marked insufficient");
    }
    weighted += result.score * dimension.weight;
    totalWeight += dimension.weight;
  }
  return {
    rubricVersion: context.rubricVersion,
    promptVersion: context.promptVersion,
    modelProvider: context.modelProvider,
    modelName: context.modelName,
    dimensions: output.dimensions,
    overallScore: totalWeight > 0 ? Math.round(weighted / totalWeight) : 0,
    feedback: output.feedback,
  };
}

/** Phase 4 逐题评分编排。 */
export class QuestionEvaluationService implements QuestionEvaluationRunner {
  /** @param repository - 冻结上下文与原子提交端口。 @param model - 证据/评分模型。 */
  constructor(
    private readonly repository: AgentEvaluationRepository,
    private readonly model: AgentEvaluationModelProvider,
  ) {}

  /**
   * 提取证据、评分并在非法评分时只修复一次，最终原子提交。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param questionId - 当前题目 UUID。
   * @returns 首次提交或幂等重放 receipt。
   */
  async evaluateAndCommit(
    sessionId: string,
    questionId: string,
  ): Promise<QuestionEvaluationReceipt> {
    const context = await this.repository.loadContext(sessionId, questionId);
    const evidence = validateExtractedEvidence(
      context,
      await this.model.extractEvidence(context),
    );
    let evaluation: QuestionEvaluation | undefined;
    for (const repair of [false, true]) {
      try {
        evaluation = buildQuestionEvaluation(
          context,
          evidence,
          await this.model.evaluate(context, evidence, repair),
        );
        break;
      } catch (error) {
        if (repair) {
          await this.repository.markEvaluationFailed(sessionId, questionId);
          throw error;
        }
      }
    }
    if (!evaluation) throw new Error("Evaluation repair did not produce a result");
    return this.repository.commitEvaluation({ context, evidence, evaluation });
  }
}
