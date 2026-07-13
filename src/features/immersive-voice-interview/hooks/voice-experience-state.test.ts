/** immersive-voice-interview：状态转换与完成态稳定性测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { reduceVoiceExperienceState } from "./voice-experience-state";

test("voice experience follows speaking, listening, and processing order", () => {
  let state = reduceVoiceExperienceState("idle", "connect");
  state = reduceVoiceExperienceState(state, "connected");
  state = reduceVoiceExperienceState(state, "interviewer_audio");
  state = reduceVoiceExperienceState(state, "listen");
  state = reduceVoiceExperienceState(state, "transcript_final");
  assert.equal(state, "processing");
});

test("network loss exposes recovery and completed state ignores late events", () => {
  assert.equal(reduceVoiceExperienceState("listening", "connection_lost"), "reconnecting");
  assert.equal(reduceVoiceExperienceState("reconnecting", "failed"), "recovery_required");
  assert.equal(reduceVoiceExperienceState("completed", "connected"), "completed");
});
