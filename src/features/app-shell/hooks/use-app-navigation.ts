import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { signOut } from "../api";
import type { AppNavigationPath } from "../types";

export function useAppNavigation() {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [signingOut, setSigningOut] = useState(false);

  const isActive = useCallback(
    (to: AppNavigationPath) => pathname === to || pathname.startsWith(`${to}/`),
    [pathname],
  );

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      await router.navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出登录失败");
    } finally {
      setSigningOut(false);
    }
  }

  return { pathname, isActive, signingOut, handleSignOut };
}
