/** auth-session：验证本地会话快速恢复与远端可信校验的顺序。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { recoverAuthenticatedUser } from "./session-recovery";

/** 创建测试所需的最小 Supabase 用户投影。 */
function createUser(id: string): User {
  return { id } as User;
}

test("missing local session skips remote verification", async () => {
  let verificationCalls = 0;

  const user = await recoverAuthenticatedUser(
    {
      getLocalUser: async () => null,
      getVerifiedUser: async () => {
        verificationCalls += 1;
        return createUser("verified");
      },
    },
    () => assert.fail("local user callback must not run"),
  );

  assert.equal(user, null);
  assert.equal(verificationCalls, 0);
});

test("local user is exposed before remote verification and rejected verification invalidates it", async () => {
  const localUser = createUser("local");
  const exposedUsers: User[] = [];
  let rejectVerification: ((error: Error) => void) | undefined;
  const verification = new Promise<User | null>((_resolve, reject) => {
    rejectVerification = reject;
  });

  const recovery = recoverAuthenticatedUser(
    {
      getLocalUser: async () => localUser,
      getVerifiedUser: () => verification,
    },
    (user) => exposedUsers.push(user),
  );

  await Promise.resolve();
  assert.deepEqual(exposedUsers, [localUser]);
  rejectVerification?.(new Error("network unavailable"));
  assert.equal(await recovery, null);
});
