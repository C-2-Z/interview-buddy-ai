/** auth-session：编排本地会话快速恢复与远端可信用户校验。 */
import type { User } from "@supabase/supabase-js";

/** 会话恢复流程依赖的用户读取能力。 */
export type SessionRecoveryDependencies = Readonly<{
  /** 从持久化会话中读取可立即展示的用户。 */
  getLocalUser: () => Promise<User | null>;
  /** 从认证服务读取可信用户。 */
  getVerifiedUser: () => Promise<User | null>;
}>;

/**
 * 优先恢复本地用户，并在存在本地会话时执行远端可信校验。
 *
 * @param dependencies - 本地与远端用户读取函数。
 * @param onLocalUser - 本地用户恢复后立即触发的展示回调。
 * @returns 远端校验后的可信用户；会话缺失或失效时返回 null。
 */
export async function recoverAuthenticatedUser(
  dependencies: SessionRecoveryDependencies,
  onLocalUser: (user: User) => void,
): Promise<User | null> {
  const localUser = await dependencies.getLocalUser();
  if (!localUser) return null;

  onLocalUser(localUser);
  try {
    return await dependencies.getVerifiedUser();
  } catch {
    return null;
  }
}
