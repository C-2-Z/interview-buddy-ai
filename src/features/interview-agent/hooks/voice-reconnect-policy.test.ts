/** 语音重连退避策略测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { nextVoiceReconnectDelay } from "./voice-reconnect-policy";

/** 重连按指数增长并限制最大等待，避免弱网请求风暴。 */
test("voice reconnect uses bounded exponential backoff", () => {
  assert.equal(nextVoiceReconnectDelay(0), 500);
  assert.equal(nextVoiceReconnectDelay(1), 1_000);
  assert.equal(nextVoiceReconnectDelay(2), 2_000);
  assert.equal(nextVoiceReconnectDelay(10), 8_000);
});
