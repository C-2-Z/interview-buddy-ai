/** Interview lifecycle Service：编排产品状态更新与 LangGraph checkpoint 清理。 */
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { deleteAgentRuntimeCheckpoint } from "../interview-agent/interview-agent.service.js";
import type { InterviewLifecycleRepository } from "./interview-lifecycle.repository.js";
import type {
  InterviewDeleteResult,
  InterviewLifecycleAction,
  InterviewLifecycleResult,
} from "./interview-lifecycle.types.js";

const logger = createModuleLogger("interview-lifecycle");

/** 生命周期业务失败；只包含稳定错误码和可恢复性。 */
export class InterviewLifecycleServiceError extends Error {
  /** 稳定客户端错误码。 */
  readonly code: string;
  /** 建议 HTTP 状态。 */
  readonly statusCode: 409 | 503;
  /** 客户端是否适合原地重试。 */
  readonly retryable: boolean;

  /** 创建不暴露原始依赖异常的服务错误。 */
  constructor(code: string, message: string, statusCode: 409 | 503, retryable: boolean) {
    super(message);
    this.name = "InterviewLifecycleServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/** 生命周期服务依赖。 */
export type InterviewLifecycleServiceDependencies = Readonly<{
  /** 用户作用域数据库 Repository。 */
  repository: InterviewLifecycleRepository;
  /** 删除指定 Graph thread 的 checkpoint。 */
  deleteCheckpoint?: (threadId: string) => Promise<void>;
}>;

/** 生命周期业务服务。 */
export class InterviewLifecycleService {
  /** @param dependencies - 数据库与 checkpoint 删除能力。 */
  constructor(private readonly dependencies: InterviewLifecycleServiceDependencies) {}

  /**
   * 执行暂停、恢复、提前结束或放弃；终态会同步删除 checkpoint，防止旧 Graph 再次写入。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @param action - 请求的产品生命周期动作。
   * @returns 动作完成后的产品状态与报告可用性。
   */
  async transition(
    sessionId: string,
    action: InterviewLifecycleAction,
  ): Promise<InterviewLifecycleResult> {
    let result: InterviewLifecycleResult;
    try {
      result = await this.dependencies.repository.transition(sessionId, action);
    } catch {
      throw new InterviewLifecycleServiceError(
        "lifecycle_transition_failed",
        "无法更新面试状态，请重试或联系管理员。",
        409,
        true,
      );
    }

    if (action === "finish" || action === "abandon") {
      await this.removeCheckpoint(sessionId);
    }
    return result;
  }

  /**
   * 删除业务会话后清理对应 checkpoint；业务数据已删除时仍返回成功，checkpoint 失败只记录稳定告警。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @returns 删除确认。
   */
  async deleteSession(sessionId: string): Promise<InterviewDeleteResult> {
    let deleted: { sessionId: string; threadId: string; deleted: true };
    try {
      deleted = await this.dependencies.repository.deleteSession(sessionId);
    } catch {
      throw new InterviewLifecycleServiceError(
        "lifecycle_delete_failed",
        "无法删除面试记录，请重试或联系管理员。",
        503,
        true,
      );
    }
    await this.removeCheckpoint(deleted.threadId);
    return { sessionId: deleted.sessionId, deleted: true };
  }

  /**
   * 尽力清理 checkpoint；业务终态已经提交时不因基础设施短暂失败回滚用户可见结果。
   *
   * @param threadId - 与会话绑定的 LangGraph thread ID。
   */
  private async removeCheckpoint(threadId: string): Promise<void> {
    try {
      await (this.dependencies.deleteCheckpoint ?? deleteAgentRuntimeCheckpoint)(threadId);
    } catch {
      logger.warn("Agent checkpoint cleanup will require an administrative retry", {
        threadId,
      });
    }
  }
}
