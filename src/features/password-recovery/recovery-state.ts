/** password-recovery：以有限状态机约束恢复会话与提交阶段。 */
import type { PasswordRecoveryStep } from "./types";

/** 密码恢复页面状态。 */
export type PasswordRecoveryState = Readonly<{
  /** 当前恢复步骤。 */
  step: PasswordRecoveryStep;
}>;

/** 允许改变密码恢复步骤的领域事件。 */
export type PasswordRecoveryAction =
  | Readonly<{ type: "SESSION_READY" }>
  | Readonly<{ type: "SESSION_INVALID" }>
  | Readonly<{ type: "SUBMIT" }>
  | Readonly<{ type: "SUBMIT_SUCCESS" }>
  | Readonly<{ type: "SUBMIT_FAILURE" }>;

/**
 * 根据恢复事件推进页面状态，非法或过期会话不会进入密码表单。
 *
 * @param state - 当前恢复状态。
 * @param action - Supabase 会话或提交事件。
 * @returns 下一恢复状态。
 */
export function reduceRecoveryState(
  state: PasswordRecoveryState,
  action: PasswordRecoveryAction,
): PasswordRecoveryState {
  switch (action.type) {
    case "SESSION_READY":
      return { step: "ready" };
    case "SESSION_INVALID":
      return { step: "invalid" };
    case "SUBMIT":
      return state.step === "ready" ? { step: "submitting" } : state;
    case "SUBMIT_SUCCESS":
      return state.step === "submitting" ? { step: "complete" } : state;
    case "SUBMIT_FAILURE":
      return state.step === "submitting" ? { step: "ready" } : state;
  }
}
