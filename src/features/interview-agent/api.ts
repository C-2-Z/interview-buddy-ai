/**
 * interview-agent API 调用：Agent Canonical API 客户端。
 */
import { apiClient } from "@/lib/api-client";
import type { AgentSessionView, AgentInputBody, CreateAgentSessionBody, CreateAgentSessionResponse } from "./types";

/**
 * 创建 Agent 面试会话。
 * 返回 HTTP 202 及 sessionId，后续通过 SSE 获取事件。
 *
 * @param body - 创建参数。
 * @returns 包含 sessionId 和 eventCursor 的 202 响应。
 */
export function createAgentSession(body: CreateAgentSessionBody): Promise<CreateAgentSessionResponse> {
  return apiClient.post("/api/agent/sessions", { body }).then((res) => res.json());
}

/**
 * 获取 Agent 会话最新快照。
 *
 * @param sessionId - Agent 会话 UUID。
 * @returns 会话快照视图。
 */
export function getAgentSession(sessionId: string): Promise<AgentSessionView> {
  return apiClient.get(`/api/agent/sessions/${sessionId}`).then((res) => res.json());
}

/**
 * 向 Agent 会话提交文本输入。
 * inputId 必须由客户端生成（如 crypto.randomUUID()），以支持幂等重试。
 *
 * @param sessionId - Agent 会话 UUID。
 * @param input - 已校验文本输入。
 * @returns 提交结果，包含快照。
 */
export function submitAgentInput(
  sessionId: string,
  input: AgentInputBody,
): Promise<{ duplicate: boolean; snapshot: import("./types").AgentSnapshot }> {
  return apiClient
    .post(`/api/agent/sessions/${sessionId}/input`, { body: input })
    .then((res) => res.json());
}

/**
 * 中断 Agent 会话当前操作（如 LLM/TTS 输出）。
 *
 * @param sessionId - Agent 会话 UUID。
 * @returns 中断结果。
 */
export function interruptAgentSession(sessionId: string): Promise<{ accepted: boolean }> {
  return apiClient.post(`/api/agent/sessions/${sessionId}/interrupt`).then((res) => res.json());
}

/**
 * 完成 Agent 会话（强制结束等待中的面试）。
 *
 * @param sessionId - Agent 会话 UUID。
 * @returns 会话视图。
 */
export function finishAgentSession(sessionId: string): Promise<AgentSessionView> {
  return apiClient.post(`/api/agent/sessions/${sessionId}/finish`).then((res) => res.json());
}

/**
 * 重试 Agent 会话准备（仅对 preparing 或 failed 状态的会话有效）。
 *
 * @param sessionId - Agent 会话 UUID。
 * @returns 重试结果。
 */
export function retryAgentSession(sessionId: string): Promise<{ duplicate: boolean; snapshot: import("./types").AgentSnapshot }> {
  return apiClient.post(`/api/agent/sessions/${sessionId}/retry`).then((res) => res.json());
}

/**
 * 连接 Agent 会话 SSE 事件流。
 *
 * @param sessionId - Agent 会话 UUID。
 * @param lastEventId - 上次收到的事件序号，断线重连时传入。
 * @returns EventSource 实例。
 */
export function connectAgentEventStream(sessionId: string, lastEventId?: number): EventSource {
  const url = new URL(`/api/agent/sessions/${sessionId}/events`, window.location.origin);
  if (lastEventId != null && lastEventId > 0) {
    url.searchParams.set("lastEventId", String(lastEventId));
  }
  return new EventSource(url.toString());
}
