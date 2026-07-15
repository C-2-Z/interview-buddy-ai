/** Interview Agent Phase 3 题库优先后续选题与持久化业务服务。 */
import { randomUUID } from "node:crypto";
import type { AgentModelProvider } from "../providers/agent-model.provider.js";
import { getRolePersona } from "../roles/personas.js";
import type { InterviewPreparationRepository } from "../tools/preparation.repository.js";
import type { AgentQuestionCandidate } from "../tools/preparation.types.js";
import { formatUntrustedResearchForPrompt } from "../providers/web-search.provider.js";
import { normalizeQuestionTopic, selectQuestionWithFallback } from "../tools/question-selector.js";
import type { QuestionRuntimeRepository } from "./question-runtime.repository.js";
import type { SelectedRuntimeQuestion, SelectRuntimeQuestionInput } from "./question-runtime.types.js";

/** Graph 依赖的后续题选择端口。 */
export interface QuestionRuntimeService {
  /** 选择并原子提交当前索引题目。 */
  selectAndCommit(input: SelectRuntimeQuestionInput): Promise<SelectedRuntimeQuestion>;
}

/** 生产后续题服务依赖。 */
export type QuestionRuntimeDependencies = {
  /** 冻结计划和题目提交 Repository。 */
  runtimeRepository: QuestionRuntimeRepository;
  /** 公共题库只读 Repository。 */
  preparationRepository: Pick<InterviewPreparationRepository, "searchQuestionBank">
    & Partial<Pick<InterviewPreparationRepository, "loadResumeSummary">>;
  /** 题库无候选时的模型 Adapter。 */
  modelProvider: AgentModelProvider;
  /** 按引用读取已脱敏工具上下文；正文仅在单次模型调用期间存在。 */
  loadObservationContexts?(sessionId: string, observationIds: string[]): Promise<string[]>;
};

/** 题库优先的后续题业务服务。 */
export class DefaultQuestionRuntimeService implements QuestionRuntimeService {
  /** @param dependencies - 运行时、题库和模型端口。 */
  constructor(private readonly dependencies: QuestionRuntimeDependencies) {}

  /** @inheritdoc */
  async selectAndCommit(input: SelectRuntimeQuestionInput): Promise<SelectedRuntimeQuestion> {
    const context = await this.dependencies.runtimeRepository.loadContext(input.sessionId);
    const expectedRole = context.plan.questionRoles[input.questionIndex];
    // plan-v3 已冻结每题主维度；Reflection 只能调整主题、证据目标和意图，不能改写量表。
    const dimensionKey = context.plan.questionDimensions[input.questionIndex];
    if (!expectedRole || !dimensionKey || expectedRole !== input.roleId) {
      throw new Error("Frozen Agent plan does not match the requested question index");
    }
    const [candidates, resumeSummary, observationContexts] = await Promise.all([
      this.dependencies.preparationRepository.searchQuestionBank({
        position: context.config.position,
        difficulty: context.config.difficulty,
        limit: 50,
      }),
      this.dependencies.preparationRepository.loadResumeSummary?.(context.config.resumeId)
        ?? Promise.resolve(null),
      this.dependencies.loadObservationContexts?.(
        input.sessionId,
        input.observationIds ?? [],
      ).catch(() => []) ?? [],
    ]);
    const selected = await selectQuestionWithFallback(candidates, {
      position: context.config.position,
      difficulty: context.config.difficulty,
      roleId: input.roleId,
      dimensionKey,
      desiredTopicKeys: input.topicKeys,
      evidenceGoalKeys: input.evidenceGoalKeys,
      excludedQuestionIds: new Set(context.questions.flatMap((question) => [question.id, question.bankQuestionId].filter((id): id is string => Boolean(id)))),
      excludedQuestionTexts: new Set(context.questions.map((question) => normalizeQuestionTopic(question.question))),
      // 能力维度允许跨题重复覆盖；主题去重不能把整个维度误判为已禁用标签。
      excludedTopicKeys: new Set(),
    }, async (): Promise<AgentQuestionCandidate> => {
      const generated = await this.dependencies.modelProvider.generateQuestion({
        sessionId: input.sessionId,
        questionIndex: input.questionIndex,
        roleId: input.roleId,
        persona: getRolePersona(input.roleId),
        position: context.config.position,
        difficulty: context.config.difficulty,
        promptVersion: context.config.promptVersion,
        modelProvider: context.config.modelProvider,
        modelName: context.config.modelName,
        dimensionKey,
        strategyIntent: input.questionIntent,
        trustedContext: {
          jobDescription: context.config.jobDescription,
          resumeSummary,
        },
        untrustedResearchContext: formatUntrustedResearchForPrompt(context.plan.researchSources),
        toolResultContext: observationContexts.join("\n").slice(0, 12_000),
      });
      return {
        id: generated.questionId, question: generated.content, position: context.config.position,
        difficulty: context.config.difficulty, type: dimensionKey, tags: [dimensionKey],
        roleIds: [input.roleId], dimensionKeys: [dimensionKey],
        topicKeys: input.topicKeys ?? [], evidenceGoalKeys: input.evidenceGoalKeys ?? [], source: "model",
      };
    });
    const questionId = randomUUID();
    const receipt = await this.dependencies.runtimeRepository.commitQuestion({
      sessionId: input.sessionId, id: questionId, orderIndex: input.questionIndex,
      question: selected.question, roleId: input.roleId, dimensionKey, source: selected.source,
      bankQuestionId: selected.source === "bank" ? selected.id : null,
    });
    return { questionId: receipt.questionId, roleId: receipt.roleId, dimensionKey: receipt.dimensionKey };
  }
}
