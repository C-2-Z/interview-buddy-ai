/** password-recovery：验证新密码规则不会因 UI 重构而漂移。 */
import assert from "node:assert/strict";
import test from "node:test";
import { validateNewPassword } from "./validation";

test("new password validation rejects short and mismatched values", () => {
  assert.equal(validateNewPassword("12345", "12345"), "密码至少需要 6 个字符");
  assert.equal(validateNewPassword("123456", "654321"), "两次输入的密码不一致");
  assert.equal(validateNewPassword("123456", "123456"), null);
});
