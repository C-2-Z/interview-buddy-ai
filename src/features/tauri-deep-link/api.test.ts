/** tauri-deep-link：验证只接受白名单认证深链且不暴露原始 URL。 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthDeepLink } from "./api";

test("parser accepts only known interviewbuddy auth callbacks", () => {
  assert.deepEqual(parseAuthDeepLink("interviewbuddy://auth/reset-password?code=abc&state=s"), {
    kind: "password-recovery",
    code: "abc",
    state: "s",
  });
  assert.deepEqual(parseAuthDeepLink("interviewbuddy://auth/callback?code=abc"), {
    kind: "auth-callback",
    code: "abc",
  });
  assert.equal(parseAuthDeepLink("https://evil.test/auth/reset-password?code=abc"), null);
  assert.equal(parseAuthDeepLink("interviewbuddy://other/reset-password?code=abc"), null);
  assert.equal(parseAuthDeepLink("interviewbuddy://auth/reset-password"), null);
});
