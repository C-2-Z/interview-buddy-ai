/** auth-session：为普通 AppShell 与沉浸式 focus 路由复用同一登录守卫。 */
import { Outlet } from "@tanstack/react-router";
import { AppShell } from "@/features/app-shell/components/app-shell";
import { useAuthenticatedUser } from "../hooks/use-authenticated-user";

/** 认证布局的显示选项。 */
export type AuthenticatedLayoutProps = Readonly<{
  /** true 使用常规应用导航，false 仅渲染专注内容。 */
  withAppShell: boolean;
}>;

// 会话确认前渲染固定高度加载壳；确认后再决定是否包裹 AppShell。
export function AuthenticatedLayout({ withAppShell }: AuthenticatedLayoutProps) {
  const { user, checking } = useAuthenticatedUser();

  if (checking || !user) {
    return (
      <main
        className="flex min-h-dvh items-center justify-center bg-background px-4"
        aria-live="polite"
      >
        <p className="text-sm text-muted-foreground">正在确认登录状态…</p>
      </main>
    );
  }

  if (!withAppShell) return <Outlet />;
  return (
    <AppShell userEmail={user.email}>
      <Outlet />
    </AppShell>
  );
}
