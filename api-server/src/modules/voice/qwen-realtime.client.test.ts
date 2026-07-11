import assert from "node:assert/strict";
import test from "node:test";
import { createQwenTtsSession } from "./qwen-realtime.client.js";

test("mock reusable TTS session supports multiple utterances", async () => {
  const previous = process.env.VOICE_MOCK_QWEN;
  process.env.VOICE_MOCK_QWEN = "1";
  try {
    const session = createQwenTtsSession({ model: "mock", sampleRate: 24000 });
    const sizes: number[] = [];
    for await (const chunk of session.speak("第一句")) sizes.push(chunk.length);
    for await (const chunk of session.speak("第二句")) sizes.push(chunk.length);
    assert.equal(sizes.length, 2);
    assert.ok(sizes.every((size) => size > 0));
    assert.equal(session.closed, false);
    session.close();
    assert.equal(session.closed, true);
  } finally {
    process.env.VOICE_MOCK_QWEN = previous;
  }
});
