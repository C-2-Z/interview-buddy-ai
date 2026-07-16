/** 首题生成监听与补发策略测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { selectVoicePromptQuestion } from "./voice-prompt-listener";

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";

/** WebSocket 已连接后，SSE question_ready 立即触发播报请求。 */
test("question-ready event requests the first prompt", () => {
  assert.equal(
    selectVoicePromptQuestion({
      connected: true,
      lastEvent: { type: "agent.question_ready", questionId: QUESTION_ID },
      snapshotQuestionId: null,
      lastRequestedQuestionId: null,
    }),
    QUESTION_ID,
  );
});

/** SSE 早于 WebSocket 时，用持久 snapshot 在连接后补发播报。 */
test("connected snapshot recovers a question-ready event missed before socket open", () => {
  assert.equal(
    selectVoicePromptQuestion({
      connected: true,
      lastEvent: null,
      snapshotQuestionId: QUESTION_ID,
      lastRequestedQuestionId: null,
    }),
    QUESTION_ID,
  );
});

/** 未连接或同一题已经请求时不重复发送。 */
test("prompt listener suppresses disconnected and duplicate requests", () => {
  assert.equal(
    selectVoicePromptQuestion({
      connected: false,
      lastEvent: { type: "agent.question_ready", questionId: QUESTION_ID },
      snapshotQuestionId: QUESTION_ID,
      lastRequestedQuestionId: null,
    }),
    null,
  );
  assert.equal(
    selectVoicePromptQuestion({
      connected: true,
      lastEvent: { type: "agent.question_ready", questionId: QUESTION_ID },
      snapshotQuestionId: QUESTION_ID,
      lastRequestedQuestionId: QUESTION_ID,
    }),
    null,
  );
});
