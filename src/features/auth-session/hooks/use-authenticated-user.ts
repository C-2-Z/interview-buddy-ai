/** auth-session：在 hydration 后检查浏览器登录态并执行安全跳转。 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAuthenticatedUser } from "../api";
import type { AuthSessionState } from "../types";

/**
 * 只在客户端验证 Supabase 会话，避免 SSR 与 localStorage 登录态竞速。
 *
 * @returns 当前用户与检查状态。
 */
export function useAuthenticatedUser(): AuthSessionState {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthSessionState>({ user: null, checking: true });

  useEffect(() => {
    let active = true;
    void getAuthenticatedUser().then((user) => {
      if (!active) return;
      if (!user) {
        void navigate({ to: "/auth", replace: true });
        return;
      }
      setState({ user, checking: false });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return state;
}
