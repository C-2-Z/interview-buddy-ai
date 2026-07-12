/** Interview Agent 模型调用耗时、Token 和稳定错误码的通用审计包装器。 */
import type { AgentRunAuditor } from "./agent-run.repository.js";

/** Token 用量。 */
export type AgentTokenUsage = {
  /** 输入 Token。 */ promptTokens: number | null;
  /** 输出 Token。 */ completionTokens: number | null;
  /** 总 Token。 */ totalTokens: number | null;
};

/** 审计包装元数据。 */
export type AuditedModelCallInput = {
  /** 可选审计器。 */ auditor?: AgentRunAuditor;
  /** 会话 UUID。 */ sessionId: string;
  /** 确定性操作键。 */ operationKey: string;
  /** 节点名。 */ nodeName: string;
  /** 模型供应商。 */ modelProvider: string;
  /** 模型名。 */ modelName: string;
  /** Prompt 版本。 */ promptVersion: string;
};

/**
 * 执行模型调用并尽力记录审计；审计失败不会覆盖模型业务结果。
 *
 * @param input - 不含 Prompt、回答和 Key 的审计元数据。
 * @param invoke - 接收 Token 回调的真实模型调用。
 * @returns 模型调用结果。
 */
export async function executeAuditedModelCall<T>(
  input: AuditedModelCallInput,
  invoke: (onUsage: (usage: AgentTokenUsage) => void) => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const auditMetadata = {
    sessionId: input.sessionId,
    operationKey: input.operationKey,
    nodeName: input.nodeName,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    promptVersion: input.promptVersion,
  };
  let usage: AgentTokenUsage = {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  };
  try {
    const result = await invoke((value) => { usage = value; });
    await input.auditor?.record({
      ...auditMetadata,
      status: "completed",
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      ...usage,
      errorCode: null,
    }).catch(() => undefined);
    return result;
  } catch (error) {
    await input.auditor?.record({
      ...auditMetadata,
      status: "failed",
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      ...usage,
      errorCode: "model_call_failed",
    }).catch(() => undefined);
    throw error;
  }
}
