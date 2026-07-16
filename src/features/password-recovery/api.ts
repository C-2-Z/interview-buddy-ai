/** password-recovery：封装 Supabase 密码恢复调用并统一安全错误。 */
import { supabase } from "@/integrations/supabase/client";
import { getPasswordRecoveryRedirectUrl } from "@/shared/runtime/runtime-config";
import { PasswordRecoveryError } from "./types";

/** Supabase 密码恢复所需的最小认证端口。 */
export type PasswordRecoveryAuthPort = {
  /** 发送密码恢复邮件。 */
  resetPasswordForEmail: (
    email: string,
    options: { redirectTo: string },
  ) => Promise<{ error: Error | null }>;
  /** 更新恢复会话所属用户的密码。 */
  updateUser: (attributes: { password: string }) => Promise<{ error: Error | null }>;
  /** 退出仅用于密码恢复的临时会话。 */
  signOut: () => Promise<{ error: Error | null }>;
};

/**
 * 通过指定认证端口发送密码恢复邮件，便于测试参数与安全边界。
 *
 * @param auth - Supabase 兼容认证端口。
 * @param email - 用户提交的邮箱。
 * @param currentOrigin - 当前 Web origin，用于生成回跳地址。
 */
export async function requestPasswordResetWithAuth(
  auth: PasswordRecoveryAuthPort,
  email: string,
  currentOrigin: string,
): Promise<void> {
  const { error } = await auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getPasswordRecoveryRedirectUrl(currentOrigin),
  });
  if (error) {
    throw new PasswordRecoveryError("暂时无法发送重置邮件，请稍后重试");
  }
}

/**
 * 请求当前用户的密码恢复邮件。
 *
 * @param email - 用户提交的邮箱。
 * @param currentOrigin - 当前 Web origin。
 */
export function requestPasswordReset(email: string, currentOrigin: string): Promise<void> {
  return requestPasswordResetWithAuth(supabase.auth, email, currentOrigin);
}

/**
 * 通过指定认证端口更新恢复会话中的密码。
 *
 * @param auth - Supabase 兼容认证端口。
 * @param password - 已通过本地校验的新密码。
 */
export async function updateRecoveredPasswordWithAuth(
  auth: PasswordRecoveryAuthPort,
  password: string,
): Promise<void> {
  const { error } = await auth.updateUser({ password });
  if (error) {
    throw new PasswordRecoveryError("密码更新失败，请重新打开恢复邮件后再试");
  }
}

/** 使用当前 Supabase 恢复会话更新密码。 */
export function updateRecoveredPassword(password: string): Promise<void> {
  return updateRecoveredPasswordWithAuth(supabase.auth, password);
}

/**
 * 退出指定认证端口中的临时恢复会话。
 *
 * @param auth - Supabase 兼容认证端口。
 */
export async function finishPasswordRecoveryWithAuth(
  auth: PasswordRecoveryAuthPort,
): Promise<void> {
  const { error } = await auth.signOut();
  if (error) {
    throw new PasswordRecoveryError("密码已更新，请返回登录页重新登录");
  }
}

/** 退出当前 Supabase 临时恢复会话。 */
export function finishPasswordRecovery(): Promise<void> {
  return finishPasswordRecoveryWithAuth(supabase.auth);
}
