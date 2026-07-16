/** auth-login：已登录用户访问认证页时跳转到面试工作台。 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { hasAuthenticatedUser } from "../api";

/** 已登录用户无需再次认证，客户端确认会话后执行安全跳转。 */
export function useAuthUserRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    void hasAuthenticatedUser().then((authenticated) => {
      if (authenticated) void navigate({ to: "/interview-hub", replace: true });
    });
  }, [navigate]);
}
