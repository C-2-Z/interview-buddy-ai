/** 共享模块日志必须在脱敏后实际写入输出流。 */
import assert from "node:assert/strict";
import test from "node:test";
import { createModuleLogger } from "./voice-logger.js";

/** 捕获一次 stdout 写入并验证敏感元数据不会泄漏。 */
test("module logger emits sanitized metadata", () => {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    createModuleLogger("logger-test").info("safe_event", {
      apiKey: "must-not-appear",
      status: "ready",
    });
  } finally {
    process.stdout.write = originalWrite;
  }
  const output = chunks.join("");
  assert.match(output, /safe_event/);
  assert.match(output, /ready/);
  assert.match(output, /\[redacted\]/);
  assert.doesNotMatch(output, /must-not-appear/);
});
