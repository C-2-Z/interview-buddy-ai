/** password-recovery：锁定 Supabase 调用参数与安全错误边界。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  finishPasswordRecoveryWithAuth,
  requestPasswordResetWithAuth,
  updateRecoveredPasswordWithAuth,
  type PasswordRecoveryAuthPort,
} from "./api";

/** 创建记录认证调用的内存端口，避免测试访问真实 Supabase。 */
function fakeAuth(calls: Array<Readonly<Record<string, unknown>>>): PasswordRecoveryAuthPort {
  return {
    async resetPasswordForEmail(email, options) {
      calls.push({ operation: "reset", email, options });
      return { error: null };
    },
    async updateUser(attributes) {
      calls.push({ operation: "update", attributes });
      return { error: null };
    },
    async signOut() {
      calls.push({ operation: "sign-out" });
      return { error: null };
    },
  };
}

test("request uses a trimmed email and platform recovery redirect", async () => {
  const calls: Array<Readonly<Record<string, unknown>>> = [];

  await requestPasswordResetWithAuth(fakeAuth(calls), " user@example.com ", "https://app.test");

  assert.deepEqual(calls[0], {
    operation: "reset",
    email: "user@example.com",
    options: { redirectTo: "https://app.test/auth/reset-password" },
  });
});

test("recovered password updates before the temporary session signs out", async () => {
  const calls: Array<Readonly<Record<string, unknown>>> = [];
  const auth = fakeAuth(calls);

  await updateRecoveredPasswordWithAuth(auth, "new-password");
  await finishPasswordRecoveryWithAuth(auth);

  assert.deepEqual(calls, [
    { operation: "update", attributes: { password: "new-password" } },
    { operation: "sign-out" },
  ]);
});

test("provider failures expose stable messages without raw details", async () => {
  const auth = fakeAuth([]);
  auth.resetPasswordForEmail = async () => ({
    error: new Error("database password leaked for user@example.com"),
  });

  await assert.rejects(
    requestPasswordResetWithAuth(auth, "user@example.com", "https://app.test"),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "暂时无法发送重置邮件，请稍后重试" &&
      !error.message.includes("user@example.com"),
  );
});
