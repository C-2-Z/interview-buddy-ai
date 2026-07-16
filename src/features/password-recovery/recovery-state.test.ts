/** password-recovery：锁定恢复会话验证与提交状态转换。 */
import assert from "node:assert/strict";
import test from "node:test";
import { reduceRecoveryState } from "./recovery-state";

test("recovery state only exposes the password form after a valid session", () => {
  assert.deepEqual(reduceRecoveryState({ step: "checking" }, { type: "SESSION_INVALID" }), {
    step: "invalid",
  });
  assert.deepEqual(reduceRecoveryState({ step: "checking" }, { type: "SESSION_READY" }), {
    step: "ready",
  });
});

test("successful password submission completes the recovery flow", () => {
  assert.deepEqual(reduceRecoveryState({ step: "ready" }, { type: "SUBMIT" }), {
    step: "submitting",
  });
  assert.deepEqual(reduceRecoveryState({ step: "submitting" }, { type: "SUBMIT_SUCCESS" }), {
    step: "complete",
  });
  assert.deepEqual(reduceRecoveryState({ step: "submitting" }, { type: "SUBMIT_FAILURE" }), {
    step: "ready",
  });
});
