/**
 * useAgentSession Hook：管理 Agent 面试会话的完整生命周期。
 * 包括创建、输入提交、SSE 事件流和打断/重连。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AgentInputBody,
  type AgentPhase,
  type AgentSnapshot,
  type CreateAgentSessionBody,
} from "../types";
import {
  connectAgentEventStream,
  createAgentSession,
  getAgentSession,
  interruptAgentSession,
  submitAgentInput,
} from "../api";

/** Hook 返回的状态 */
export type UseAgentSessionState = {
  /** 当前快照 */
  snapshot: Readonly<AgentSnapshot> | null;
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** SSE 连接状态 */
  connected: boolean;
  /** 事件序列 */
  eventCursor: number;
};

/** Hook 返回的方法 */
export type UseAgentSessionActions = {
  /** 创建新的 Agent 面试会话 */
  create: (body: CreateAgentSessionBody) => Promise<string>;
  /** 提交文本输入 */
  submitInput: (content: string) => Promise<void>;
  /** 中断当前操作 */
  interrupt: () => Promise<void>;
  /** 重新连接 SSE */
  reconnect: () => void;
  /** 重置状态 */
  reset: () => void;
};

const SSE_RECONNECT_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 3000;

/**
 * 使用 Agent 面试会话。
 *
 * @param sessionId - 可选的现有会话 ID（用于从历史记录恢复）。
 * @returns 状态和方法。
 */
export function useAgentSession(sessionId?: string): UseAgentSessionState & UseAgentSessionActions {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [eventCursor, setEventCursor] = useState(0);
  const currentSessionId = useRef<string | undefined>(sessionId);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 清理 SSE 连接 */
  const cleanupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setConnected(false);
  }, []);

  /** 连接 SSE 事件流 */
  const connectSSE = useCallback(
    (sid: string, cursor?: number) => {
      cleanupSSE();
      try {
        const es = connectAgentEventStream(sid, cursor);
        eventSourceRef.current = es;

        es.addEventListener("agent.snapshot", (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as AgentSnapshot;
            setSnapshot(data);
            setEventCursor(data.eventCursor);
            if (data.phase === "completed" || data.phase === "failed") {
              es.close();
              setConnected(false);
            }
          } catch {
            // 忽略解析错误
          }
        });

        es.addEventListener("agent.phase", (event: MessageEvent) => {
          try {
            const { phase } = JSON.parse(event.data) as { phase: AgentPhase };
            // 更新阶段
            setSnapshot((prev) => (prev ? { ...prev, phase } : prev));
          } catch {
            // 忽略
          }
        });

        es.onopen = () => {
          setConnected(true);
          setError(null);
        };

        es.onerror = () => {
          setConnected(false);
          es.close();
          // 使用轮询作为降级方案
          pollTimerRef.current = setInterval(async () => {
            if (!sid) return;
            try {
              const view = await getAgentSession(sid);
              setSnapshot(view.snapshot);
              setEventCursor(view.snapshot.eventCursor);
              if (view.snapshot.phase === "completed" || view.snapshot.phase === "failed") {
                clearInterval(pollTimerRef.current!);
              }
            } catch {
              // 轮询失败，继续重试
            }
          }, POLL_INTERVAL_MS);
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : "SSE 连接失败");
      }
    },
    [cleanupSSE],
  );

  useEffect(() => {
    if (currentSessionId.current) {
      connectSSE(currentSessionId.current);
    }
    return cleanupSSE;
  }, [currentSessionId.current, connectSSE, cleanupSSE]);

  const create = useCallback(
    async (body: CreateAgentSessionBody): Promise<string> => {
      setLoading(true);
      setError(null);
      try {
        const result = await createAgentSession(body);
        currentSessionId.current = result.sessionId;
        setEventCursor(result.eventCursor);
        connectSSE(result.sessionId);
        setLoading(false);
        return result.sessionId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "创建面试失败";
        setError(message);
        setLoading(false);
        throw err;
      }
    },
    [connectSSE],
  );

  const submitInput = useCallback(
    async (content: string) => {
      if (!currentSessionId.current) return;
      setLoading(true);
      try {
        const inputId = crypto.randomUUID();
        const body: AgentInputBody = { inputId, type: "text", content };
        const result = await submitAgentInput(currentSessionId.current, body);
        if (result.snapshot) {
          setSnapshot(result.snapshot);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "提交回答失败");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const interrupt = useCallback(async () => {
    if (!currentSessionId.current) return;
    try {
      await interruptAgentSession(currentSessionId.current);
    } catch {
      // 打断失败可忽略
    }
  }, []);

  const reconnect = useCallback(() => {
    if (currentSessionId.current) {
      connectSSE(currentSessionId.current, eventCursor);
    }
  }, [connectSSE, eventCursor]);

  const reset = useCallback(() => {
    cleanupSSE();
    currentSessionId.current = undefined;
    setSnapshot(null);
    setEventCursor(0);
    setError(null);
    setLoading(false);
  }, [cleanupSSE]);

  return {
    snapshot,
    loading,
    error,
    connected,
    eventCursor,
    create,
    submitInput,
    interrupt,
    reconnect,
    reset,
  };
}
