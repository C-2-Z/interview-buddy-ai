/** Interview Agent 模型适配器契约与 Phase 1 确定性 Mock 实现。 */
import type {
  AgentDifficulty,
  RoleId,
  RolePersona,
} from "../interview-agent.types.js";

/** 生成一道面试题所需的最小、可审计模型输入。 */
export type AgentQuestionModelInput = Readonly<{
  /** 业务会话标识，仅用于生成稳定题目标识与追踪。 */
  sessionId: string;
  /** 当前题目在整场面试中的零基索引。 */
  questionIndex: number;
  /** 当前负责提问的固定角色。 */
  roleId: RoleId;
  /** 当前角色的提问范围、语气和禁止行为。 */
  persona: Readonly<RolePersona>;
  /** 候选人选择的目标岗位。 */
  position: string;
  /** 本场面试的冻结难度。 */
  difficulty: AgentDifficulty;
  /** 本次生成使用的冻结 Prompt 版本。 */
  promptVersion: string;
}>;

/** 模型完成一道题生成后的结构化结果。 */
export type AgentQuestionModelOutput = Readonly<{
  /** 可写入业务题目表并由 Agent State 引用的稳定题目标识。 */
  questionId: string;
  /** 交给业务消息投影层保存和发送的题目正文。 */
  content: string;
  /** 实际执行生成的模型供应商或适配器名称。 */
  modelProvider: string;
  /** 实际执行生成的模型名称。 */
  modelName: string;
  /** 生成结果对应的 Prompt 版本。 */
  promptVersion: string;
}>;

/**
 * 隔离 LangGraph 节点与具体 AI SDK/HTTP 客户端的模型适配器。
 *
 * 接口刻意不接收 API Key；真实实现应在适配器内部通过服务端配置解析凭据，避免凭据进入
 * Graph State、节点输入或 checkpoint。
 */
export interface AgentModelProvider {
  /**
   * 根据冻结岗位配置和 Persona 生成一道结构化面试题。
   *
   * Prompt 策略由 `position`、`difficulty`、`persona` 与 `questionIndex` 约束题目范围和语气，
   * 并要求适配器返回稳定题目 ID、单题正文及模型审计信息；不得由模型改变题量或结束条件。
   *
   * @param input - 不含回答正文或凭据的题目生成上下文。
   * @param signal - 可选取消信号，用于中止底层模型请求。
   * @returns 可由业务投影层持久化的结构化题目结果。
   */
  generateQuestion(
    input: AgentQuestionModelInput,
    signal?: AbortSignal,
  ): Promise<AgentQuestionModelOutput>;
}

/** 确定性 Mock 适配器的可选审计标识。 */
export type DeterministicMockAgentModelProviderOptions = Readonly<{
  /** 测试快照中记录的适配器名称。 */
  modelProvider?: string;
  /** 测试快照中记录的模型名称。 */
  modelName?: string;
}>;

/** Phase 1 使用的无网络、无凭据且完全可复现的模型适配器。 */
export class DeterministicMockAgentModelProvider implements AgentModelProvider {
  private readonly modelProvider: string;
  private readonly modelName: string;

  /**
   * 创建确定性 Mock；相同输入始终产生相同题目标识和正文。
   *
   * @param options - 可选模型审计标识，不影响题目控制流。
   */
  constructor(options: DeterministicMockAgentModelProviderOptions = {}) {
    this.modelProvider = options.modelProvider ?? "mock";
    this.modelName = options.modelName ?? "deterministic-agent-v1";
  }

  /**
   * 使用固定模板生成单题，验证 Graph 编排而不发起外部模型调用。
   *
   * Prompt 策略将角色、岗位、难度和题号映射到一段固定文本；输出严格符合
   * `AgentQuestionModelOutput`，便于 interrupt/resume 与恢复测试稳定断言。
   *
   * @param input - 已冻结且不含敏感字段的题目生成上下文。
   * @param signal - 可选取消信号；已取消时与真实适配器一样终止生成。
   * @returns 确定性题目标识、正文与 Mock 模型审计信息。
   */
  async generateQuestion(
    input: AgentQuestionModelInput,
    signal?: AbortSignal,
  ): Promise<AgentQuestionModelOutput> {
    signal?.throwIfAborted();
    const ordinal = input.questionIndex + 1;
    return {
      questionId: `mock:${input.sessionId}:${input.roleId}:${ordinal}`,
      content: `${input.persona.displayName}第 ${ordinal} 题：请结合具体经历，说明你如何胜任${input.difficulty}${input.position}岗位。`,
      modelProvider: this.modelProvider,
      modelName: this.modelName,
      promptVersion: input.promptVersion,
    };
  }
}

/**
 * 创建 Phase 1 默认 Mock 模型适配器。
 *
 * @param options - 可选模型审计标识。
 * @returns 不访问网络和凭据的确定性模型适配器。
 */
export function createDeterministicMockAgentModelProvider(
  options?: DeterministicMockAgentModelProviderOptions,
): AgentModelProvider {
  return new DeterministicMockAgentModelProvider(options);
}
