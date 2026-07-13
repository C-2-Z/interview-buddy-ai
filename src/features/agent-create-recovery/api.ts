/** Agent 创建失败恢复 feature 的 API 错误归一化。 */
import { ApiRequestError } from "@/shared/api/http-client";
import type { AgentCreateFailure } from "./types";

/** 需要管理员处理且客户端重试无意义的稳定错误码。 */
const ADMIN_CODES = new Set([
  "agent_interview_disabled",
  "agent_repository_forbidden",
  "agent_repository_invalid_output",
]);

/**
 * 将任意创建异常转换为不泄漏内部详情的恢复协议。
 *
 * @param error - createAgentSession 抛出的未知异常。
 * @returns 可安全展示并驱动单一 CTA 的失败信息。
 */
export function normalizeAgentCreateFailure(error: unknown): AgentCreateFailure {
  if (error instanceof ApiRequestError) {
    if (error.code === "agent_interview_disabled")
      return {
        code: error.code,
        message: "模拟面试服务当前未启用，请联系管理员。",
        retryable: false,
        action: "contact_admin",
      };
    if (error.code === "agent_readiness_blocked")
      return {
        code: error.code,
        message: "开始前检查结果已经变化，请重新检查当前配置。",
        retryable: false,
        action: "recheck",
      };
    if (error.code === "agent_invalid_request" || error.code === "agent_repository_invalid_input")
      return {
        code: error.code,
        message: "部分面试配置不再有效，请重新检查后再试。",
        retryable: false,
        action: "recheck",
      };
    if (ADMIN_CODES.has(error.code))
      return {
        code: error.code,
        message: "面试服务配置需要管理员处理。",
        retryable: false,
        action: "contact_admin",
      };
    if (error.status === 401)
      return {
        code: error.code,
        message: "登录状态已失效，请重新登录后继续。",
        retryable: false,
        action: "recheck",
      };
    return {
      code: error.code,
      message: error.retryable
        ? "创建没有完成，已填写内容仍然保留，可以原地重试。"
        : "创建没有完成，请重新检查服务状态。",
      retryable: error.retryable,
      action: error.retryable ? "retry_create" : "recheck",
    };
  }
  return {
    code: "create_unknown_error",
    message: "创建没有完成，已填写内容仍然保留，可以原地重试。",
    retryable: true,
    action: "retry_create",
  };
}
