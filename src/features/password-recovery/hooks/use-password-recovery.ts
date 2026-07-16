/** password-recovery：协调 Supabase 恢复会话与密码更新状态。 */
import { useCallback, useEffect, useReducer, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { finishPasswordRecovery, updateRecoveredPassword } from "../api";
import { reduceRecoveryState } from "../recovery-state";

/** Native 深链在交换会话后写入的单次恢复意图标记。 */
export const PASSWORD_RECOVERY_MARKER = "password-recovery-pending";

/** 判断当前浏览器地址或 Native 标记是否来自密码恢复邮件。 */
function hasRecoveryIntent(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    params.get("type") === "recovery" ||
    hash.get("type") === "recovery" ||
    window.sessionStorage.getItem(PASSWORD_RECOVERY_MARKER) === "true"
  );
}

/**
 * 验证密码恢复会话并提供更新密码动作。
 *
 * @returns 当前步骤、错误消息与提交函数。
 */
export function usePasswordRecovery() {
  const [state, dispatch] = useReducer(reduceRecoveryState, { step: "checking" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const recoveryIntent = hasRecoveryIntent();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") dispatch({ type: "SESSION_READY" });
    });

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active || state.step !== "checking") return;
      dispatch(
        recoveryIntent && data.user && !error
          ? { type: "SESSION_READY" }
          : { type: "SESSION_INVALID" },
      );
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [state.step]);

  const submitPassword = useCallback(async (password: string) => {
    dispatch({ type: "SUBMIT" });
    setErrorMessage(null);
    try {
      await updateRecoveredPassword(password);
      await finishPasswordRecovery();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(PASSWORD_RECOVERY_MARKER);
      }
      dispatch({ type: "SUBMIT_SUCCESS" });
    } catch (error) {
      dispatch({ type: "SUBMIT_FAILURE" });
      setErrorMessage(error instanceof Error ? error.message : "密码更新失败，请重试");
    }
  }, []);

  return { step: state.step, errorMessage, submitPassword };
}
