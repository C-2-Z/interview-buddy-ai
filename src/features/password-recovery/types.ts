/** password-recovery：定义恢复流程状态与可展示错误。 */

/** 密码恢复页面的有限状态。 */
export type PasswordRecoveryStep =
  | "checking"
  | "ready"
  | "submitting"
  | "invalid"
  | "complete";

/** 密码恢复领域错误，消息可安全直接展示给用户。 */
export class PasswordRecoveryError extends Error {
  /** 创建不携带供应商敏感信息的恢复错误。 */
  constructor(message: string) {
    super(message);
    this.name = "PasswordRecoveryError";
  }
}
