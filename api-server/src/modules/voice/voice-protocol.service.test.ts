/** 语音协议状态与资源保护的单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createVoiceConnectionState,
  VOICE_PROTOCOL_VERSION,
  type VoiceConnectionLimits,
} from "./voice-protocol.service.js";

const limits: VoiceConnectionLimits = {
  heartbeatTimeoutMs: 30_000,
  maxAnswerDurationMs: 120_000,
  maxAudioBytes: 3_840_000,
  maxPendingAudioBytes: 256_000,
  maxProcessedEventIds: 128,
};

/** 验证重复控制事件不会再次推进语音轮次。 */
test("connection state accepts each event id once", () => {
  const state = createVoiceConnectionState(limits, 1_000);
  assert.equal(state.acceptEvent("event-1", 1), true);
  assert.equal(state.acceptEvent("event-1", 1), false);
  assert.equal(state.acceptEvent("event-2", 2), true);
  assert.equal(state.acceptEvent("event-3", 2), false);
});

/** 验证心跳仅在超时窗口之后判定连接失活。 */
test("connection state expires after heartbeat timeout", () => {
  const state = createVoiceConnectionState(limits, 1_000);
  assert.equal(state.isHeartbeatExpired(30_999), false);
  assert.equal(state.isHeartbeatExpired(31_001), true);
  state.markHeartbeat(40_000);
  assert.equal(state.isHeartbeatExpired(69_999), false);
});

/** 验证音频总量和验证期缓冲均有独立硬上限。 */
test("connection state rejects oversized audio and pending buffers", () => {
  const state = createVoiceConnectionState(limits, 1_000);
  state.startTurn("turn-1", 2_000);
  assert.equal(state.acceptAudio(3_000_000, false, 3_000), "accepted");
  assert.equal(state.acceptAudio(900_000, false, 4_000), "audio_limit");

  state.startTurn("turn-2", 5_000);
  assert.equal(state.acceptAudio(200_000, true, 6_000), "accepted");
  assert.equal(state.acceptAudio(60_000, true, 7_000), "pending_limit");
});

/** 验证超长回答即使字节较少也会被终止。 */
test("connection state rejects answers beyond duration limit", () => {
  const state = createVoiceConnectionState(limits, 1_000);
  state.startTurn("turn-1", 2_000);
  assert.equal(state.acceptAudio(1, false, 122_001), "duration_limit");
});

/** 固定公开协议版本，避免前后端悄然漂移。 */
test("voice protocol exposes version one", () => {
  assert.equal(VOICE_PROTOCOL_VERSION, 1);
});
