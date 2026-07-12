/** Interview Agent 已提交事件的 SSE 快照、补发与轮询流。 */
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { AgentEvent } from "../interview-agent.types.js";

/** 单次数据库补发的上限，避免大积压长时间占用事件循环。 */
export const AGENT_EVENT_REPLAY_PAGE_SIZE = 250;

/** SSE 无事件时的数据库兜底轮询间隔。 */
export const AGENT_EVENT_POLL_INTERVAL_MS = 1_000;

/** 代理和浏览器用于保持长连接的心跳间隔。 */
export const AGENT_EVENT_PING_INTERVAL_MS = 15_000;

/** 事件流只依赖持久事件读取能力，便于 Repository 与测试替换。 */
export interface AgentEventReader {
  /**
   * 读取会话最新的已提交快照事件。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @returns 最新 `agent.snapshot` 事件。
   */
  getLatestSnapshotEvent(sessionId: string): Promise<AgentEvent>;

  /**
   * 按严格递增序号读取游标之后的已提交事件。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @param afterSequence - 已被客户端确认的最后事件序号。
   * @param limit - 单页最大事件数。
   * @returns 按 sequence 升序排列的持久事件。
   */
  listEventsAfter(
    sessionId: string,
    afterSequence: number,
    limit: number,
  ): Promise<AgentEvent[]>;
}

/** 初次连接或重连时需要先发送的一组事件。 */
export type AgentEventCatchup = {
  /** 应按顺序写入 SSE 的已提交事件。 */
  events: AgentEvent[];
  /** 写完 catch-up 后继续轮询使用的游标。 */
  cursor: number;
  /** true 表示游标无效或命中保留缺口，已用最新快照重新同步。 */
  resynced: boolean;
};

/**
 * 解析 SSE `Last-Event-ID`，非法、负数或超出安全整数范围时触发快照重同步。
 *
 * @param value - 请求头原始值。
 * @returns 合法非负整数；未提供或非法时返回 null。
 */
export function parseLastAgentEventId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * 计算初次连接或断线重连所需的持久事件补发。
 *
 * 无游标时只发送最新已提交快照；有游标时从数据库补发遗漏事件。如果游标
 * 超前、事件序号不连续或积压超过单页，则发送最新快照作为明确重同步点。
 *
 * @param reader - 持久事件读取器。
 * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
 * @param lastEventId - `Last-Event-ID` 请求头；未提供时为 undefined。
 * @returns 初始事件、后续游标和是否发生重同步。
 */
export async function loadAgentEventCatchup(
  reader: AgentEventReader,
  sessionId: string,
  lastEventId?: string,
): Promise<AgentEventCatchup> {
  const latestSnapshot = await reader.getLatestSnapshotEvent(sessionId);
  const parsedCursor = parseLastAgentEventId(lastEventId);

  // 初次连接和非法游标必须从一个已提交快照开始，不能合成未入库事件。
  if (parsedCursor === null) {
    return {
      events: [latestSnapshot],
      cursor: latestSnapshot.sequence,
      resynced: lastEventId !== undefined,
    };
  }

  if (parsedCursor === latestSnapshot.sequence) {
    return { events: [], cursor: parsedCursor, resynced: false };
  }

  // 客户端游标超前意味着本地状态不可信，回到数据库最新快照。
  if (parsedCursor > latestSnapshot.sequence) {
    return {
      events: [latestSnapshot],
      cursor: latestSnapshot.sequence,
      resynced: true,
    };
  }

  const events = await reader.listEventsAfter(
    sessionId,
    parsedCursor,
    AGENT_EVENT_REPLAY_PAGE_SIZE,
  );
  const firstSequence = events[0]?.sequence;
  const reachesSnapshot = events.at(-1)?.sequence === latestSnapshot.sequence;

  // 保留策略造成的序号缺口或积压超过一页时，快照比不完整回放更可靠。
  if (
    firstSequence !== parsedCursor + 1 ||
    events.length === AGENT_EVENT_REPLAY_PAGE_SIZE && !reachesSnapshot
  ) {
    return {
      events: [latestSnapshot],
      cursor: latestSnapshot.sequence,
      resynced: true,
    };
  }

  return {
    events,
    cursor: events.at(-1)?.sequence ?? parsedCursor,
    resynced: false,
  };
}

/**
 * 等待一小段轮询时间，并在客户端中止时立即结束等待。
 *
 * @param signal - 请求连接的中止信号。
 * @param durationMs - 最大等待毫秒数。
 * @returns 在超时或中止时完成。
 */
async function waitForPoll(
  signal: AbortSignal,
  durationMs: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, durationMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/**
 * 把一个已提交事件写成带 `id` 与类型的 SSE 帧。
 *
 * @param stream - Hono SSE 写入器。
 * @param event - Repository 读取的已提交事件。
 * @returns SSE 帧完成写入时解决。
 */
async function writeAgentEvent(
  stream: {
    writeSSE(input: {
      id?: string;
      event?: string;
      data: string;
    }): Promise<void>;
  },
  event: AgentEvent,
): Promise<void> {
  await stream.writeSSE({
    id: String(event.sequence),
    event: event.type,
    data: JSON.stringify(event),
  });
}

/**
 * 创建只投影数据库已提交事件的 SSE 响应。
 *
 * Redis 或进程内通知可在后续阶段作为唤醒优化，但这里始终每秒从持久事件表
 * 补齐游标，因此订阅竞态、API 重启或通知丢失都不会丢业务事件。
 *
 * @param context - 已经过 requireAuth 的 Hono 请求上下文。
 * @param reader - 绑定当前用户 Supabase client 的事件读取器。
 * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
 * @returns Hono SSE Response。
 */
export function streamCommittedAgentEvents(
  context: Context,
  reader: AgentEventReader,
  sessionId: string,
) {
  const lastEventId = context.req.header("last-event-id");
  return streamSSE(context, async (stream) => {
    const catchup = await loadAgentEventCatchup(reader, sessionId, lastEventId);
    let cursor = catchup.cursor;
    let lastPingAt = Date.now();

    for (const event of catchup.events) {
      await writeAgentEvent(stream, event);
    }

    while (!context.req.raw.signal.aborted) {
      const events = await reader.listEventsAfter(
        sessionId,
        cursor,
        AGENT_EVENT_REPLAY_PAGE_SIZE,
      );
      for (const event of events) {
        await writeAgentEvent(stream, event);
        cursor = event.sequence;
      }

      if (Date.now() - lastPingAt >= AGENT_EVENT_PING_INTERVAL_MS) {
        await stream.writeSSE({ event: "ping", data: "{}" });
        lastPingAt = Date.now();
      }

      if (events.length === 0) {
        await waitForPoll(
          context.req.raw.signal,
          AGENT_EVENT_POLL_INTERVAL_MS,
        );
      }
    }
  });
}
