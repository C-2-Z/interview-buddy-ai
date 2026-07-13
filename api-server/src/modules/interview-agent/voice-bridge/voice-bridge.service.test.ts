/** Agent 语音桥的通道等价、稳定幂等键和事件重放测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentEvent, AgentSnapshot } from "../interview-agent.types.js";
import type { VoiceProvider } from "../providers/voice.provider.js";
import {
  AgentVoiceBridgeService,
  type AgentVoiceServicePort,
} from "./voice-bridge.service.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const QUESTION_ID = "22222222-2222-4222-8222-222222222222";

/** 构造指定事件水位的语音快照。 */
function snapshot(eventCursor: number): AgentSnapshot {
  return {
    sessionId: SESSION_ID,
    threadId: SESSION_ID,
    version: "agent-v1",
    mode: "single",
    interviewMode: "voice",
    phase: "awaiting_answer",
    currentRole: "general",
    currentQuestionId: QUESTION_ID,
    currentQuestionIndex: 0,
    followUpCount: 1,
    pendingAction: "follow_up",
    eventCursor,
  };
}

/** 创建不会访问网络的 VoiceProvider。 */
function fakeVoiceProvider(interrupted: string[]): VoiceProvider {
  return {
    outputSampleRate: 24_000,
    createAsrSession() { throw new Error("not used"); },
    createTtsSession() { throw new Error("not used"); },
    speak() { throw new Error("not used"); },
    async interrupt(turnId) { interrupted.push(turnId); },
    async close() {},
  };
}

test("voice input uses stable turn id, voice source, and committed Agent events", async () => {
  let submitted: Parameters<AgentVoiceServicePort["submitInput"]> | undefined;
  const messageEvent: AgentEvent = {
    sequence: 11,
    type: "agent.message_completed",
    data: {
      id: "33333333-3333-4333-8333-333333333333",
      role: "assistant",
      content: "请补充你如何验证优化结果。",
      roleId: "general",
      createdAt: new Date(0).toISOString(),
      interrupted: false,
    },
  };
  const service: AgentVoiceServicePort = {
    async getSession() { return { snapshot: snapshot(10) }; },
    async submitInput(...args) {
      submitted = args;
      return { duplicate: false, operationKey: "input:voice:turn-1", snapshot: snapshot(12) };
    },
    async interruptSession() { return {}; },
  };
  const bridge = new AgentVoiceBridgeService({
    agentService: service,
    voiceProvider: fakeVoiceProvider([]),
    eventReader: {
      async listEventsAfter(_sessionId, cursor) {
        return cursor < 11
          ? [messageEvent, { sequence: 12, type: "agent.snapshot", data: snapshot(12) }]
          : [];
      },
    },
  });
  const result = await bridge.submitVoiceInput(SESSION_ID, "turn-1", " 候选人回答 ");
  assert.equal(result.inputId, "voice:turn-1");
  assert.equal(result.events[0], messageEvent);
  assert.deepEqual(submitted, [
    SESSION_ID,
    { inputId: "voice:turn-1", type: "text", content: "候选人回答" },
    "voice",
  ]);
});

test("duplicate turn returns no output events and cannot repeat TTS", async () => {
  let reads = 0;
  const bridge = new AgentVoiceBridgeService({
    agentService: {
      async getSession() { return { snapshot: snapshot(20) }; },
      async submitInput() {
        return { duplicate: true, operationKey: "input:voice:turn-retry", snapshot: snapshot(20) };
      },
      async interruptSession() { return {}; },
    },
    voiceProvider: fakeVoiceProvider([]),
    eventReader: { async listEventsAfter() { reads += 1; return []; } },
  });
  const result = await bridge.submitVoiceInput(SESSION_ID, "turn-retry", "相同回答");
  assert.equal(result.duplicate, true);
  assert.deepEqual(result.events, []);
  assert.equal(reads, 0);
});

test("interrupt cancels Agent and provider without one failure hiding the other", async () => {
  const interrupted: string[] = [];
  let agentInterrupts = 0;
  const bridge = new AgentVoiceBridgeService({
    agentService: {
      async getSession() { return { snapshot: snapshot(1) }; },
      async submitInput() { throw new Error("not used"); },
      async interruptSession() { agentInterrupts += 1; throw new Error("no active model"); },
    },
    voiceProvider: fakeVoiceProvider(interrupted),
    eventReader: { async listEventsAfter() { return []; } },
  });
  await bridge.interruptVoiceOutput(SESSION_ID, "speech-1");
  assert.equal(agentInterrupts, 1);
  assert.deepEqual(interrupted, ["speech-1"]);
});
