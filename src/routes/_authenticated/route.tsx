/** 认证布局路由：在客户端完成会话检查，避免 SSR 重定向造成 hydration 不一致。 */
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/features/app-shell/components/app-shell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

/** 认证布局先渲染稳定加载壳；会话确认后才展示子路由，未登录则在 hydration 完成后跳转。 */
function AuthedLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    // 浏览器 localStorage 是登录态真相，认证检查不能在 SSR 阶段与客户端竞速。
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        void navigate({ to: "/auth", replace: true });
        return;
      }
      setUser(data.user);
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4" aria-live="polite">
        <p className="text-sm text-muted-foreground">正在确认登录状态…</p>
      </main>
    );
  }

  return (
    <AppShell userEmail={user.email}>
      <Outlet />
    </AppShell>
  );
}
