/** password-recovery：集中维护密码规则与安全提示文案。 */

/** Supabase 邮箱密码认证允许的最小密码长度。 */
export const MIN_PASSWORD_LENGTH = 6;

/** 发送结果不披露邮箱是否存在，防止账号枚举。 */
export const PASSWORD_RESET_SENT_MESSAGE =
  "如果该邮箱已注册，你将收到一封密码重置邮件。";
