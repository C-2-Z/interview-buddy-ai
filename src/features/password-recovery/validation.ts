/** password-recovery：提供不依赖界面的新密码校验规则。 */
import { MIN_PASSWORD_LENGTH } from "./constants";

/**
 * 校验用户两次输入的新密码。
 *
 * @param password - 用户输入的新密码。
 * @param confirmation - 用户再次输入的确认密码。
 * @returns 首个可展示错误；校验通过时返回 null。
 */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`;
  }
  if (password !== confirmation) {
    return "两次输入的密码不一致";
  }
  return null;
}
