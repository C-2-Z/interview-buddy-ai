/** Interview Agent SSE 初始快照、重放和缺口恢复的单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentEvent } from "../interview-agent.types.js";
import {
  AGENT_EVENT_REPLAY_PAGE_SIZE,
  loadAgentEventCatchup,
  parseLastAgentEventId,
  type AgentEventReader,
} from "./agent-event-stream.js";
import { shouldExposeAgentEvent } from "./agent-event-visibility.js";

/** 测试中需要访问快照专属字段的事件窄类型。 */
type SnapshotEvent = Extract<AgentEvent, { type: "agent.snapshot" }>;

/** 创建测试使用的最小快照事件。 */
function snapshot(sequence: number): SnapshotEvent {
  return {
    sequence,
    type: "agent.snapshot",
    data: {
      sessionId: "f34c4bbb-a1bb-43c7-b223-7eb8281f9653",
      threadId: "f34c4bbb-a1bb-43c7-b223-7eb8281f9653",
      version: "agent-v3",
      mode: "single",
      interviewMode: "text",
      phase: "awaiting_answer",
      currentRole: "general",
      currentQuestionId: null,
      currentQuestionIndex: 0,
      followUpCount: 0,
      pendingAction: "ask",
      eventCursor: sequence,
    },
  };
}

/** 用内存数组模拟按用户 RLS 过滤后的持久事件读取器。 */
function readerFor(events: AgentEvent[]): AgentEventReader {
  return {
    async getLatestSnapshotEvent() {
      const latest = [...events]
        .reverse()
        .find((event) => event.type === "agent.snapshot");
      if (!latest) throw new Error("missing snapshot");
      return latest;
    },
    async listEventsAfter(_sessionId, afterSequence, limit) {
      return events
        .filter((event) => event.sequence > afterSequence)
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, limit);
    },
  };
}

test("Last-Event-ID parser accepts only non-negative safe integers", () => {
  assert.equal(parseLastAgentEventId(undefined), null);
  assert.equal(parseLastAgentEventId(" 12 "), 12);
  assert.equal(parseLastAgentEventId("-1"), null);
  assert.equal(parseLastAgentEventId("1.5"), null);
  assert.equal(parseLastAgentEventId("9007199254740992"), null);
});

test("initial connection starts from the latest committed snapshot", async () => {
  const latest = snapshot(4);
  const result = await loadAgentEventCatchup(
    readerFor([
      snapshot(1),
      { sequence: 2, type: "agent.phase", data: { phase: "preparing" } },
      { sequence: 3, type: "agent.phase", data: { phase: "awaiting_answer" } },
      latest,
    ]),
    latest.data.sessionId,
  );

  assert.deepEqual(result.events, [latest]);
  assert.equal(result.cursor, 4);
  assert.equal(result.resynced, false);
});

test("reconnect replays every committed event after Last-Event-ID", async () => {
  const latest = snapshot(4);
  const missing: AgentEvent[] = [
    { sequence: 2, type: "agent.phase", data: { phase: "preparing" } },
    { sequence: 3, type: "agent.phase", data: { phase: "awaiting_answer" } },
    latest,
  ];
  const result = await loadAgentEventCatchup(
    readerFor([snapshot(1), ...missing]),
    latest.data.sessionId,
    "1",
  );

  assert.deepEqual(result.events, missing);
  assert.equal(result.cursor, 4);
  assert.equal(result.resynced, false);
});

test("retention gap and cursor ahead both resync to latest snapshot", async () => {
  const latest = snapshot(9);
  const gapReader = readerFor([
    { sequence: 7, type: "agent.phase", data: { phase: "awaiting_answer" } },
    latest,
  ]);

  const gap = await loadAgentEventCatchup(
    gapReader,
    latest.data.sessionId,
    "2",
  );
  const ahead = await loadAgentEventCatchup(
    gapReader,
    latest.data.sessionId,
    "99",
  );

  assert.deepEqual(gap.events, [latest]);
  assert.equal(gap.resynced, true);
  assert.deepEqual(ahead.events, [latest]);
  assert.equal(ahead.resynced, true);
});

test("a replay page that cannot reach the latest snapshot resyncs", async () => {
  const latest = snapshot(AGENT_EVENT_REPLAY_PAGE_SIZE + 2);
  const events: AgentEvent[] = [snapshot(1)];
  for (let sequence = 2; sequence < latest.sequence; sequence += 1) {
    events.push({
      sequence,
      type: "agent.phase",
      data: { phase: "reasoning" },
    });
  }
  events.push(latest);

  const result = await loadAgentEventCatchup(
    readerFor(events),
    latest.data.sessionId,
    "1",
  );
  assert.deepEqual(result.events, [latest]);
  assert.equal(result.resynced, true);
});

test("simulation SSE hides process scoring until the session is completed", () => {
  const score = { sequence: 9, type: "agent.score_completed", data: { questionId: "22222222-2222-4222-8222-222222222222", overallScore: 88, dimensions: {} } } as AgentEvent;
  const activity = { sequence: 10, type: "agent.activity", data: { id: "33333333-3333-4333-8333-333333333333", kind: "planning", status: "completed", label: "hidden" } } as AgentEvent;
  assert.equal(shouldExposeAgentEvent(score, "simulation", "in_progress"), false);
  assert.equal(shouldExposeAgentEvent(activity, "simulation", "in_progress"), false);
  assert.equal(shouldExposeAgentEvent(score, "simulation", "completed"), true);
  assert.equal(shouldExposeAgentEvent(score, "coaching", "in_progress"), true);
});
