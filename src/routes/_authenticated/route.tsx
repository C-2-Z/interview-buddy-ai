/** 认证应用布局：登录后使用标准 AppShell。 */
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedLayout } from "@/features/auth-session/components/authenticated-layout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedAppRoute,
});

// 路由文件只选择外壳，认证流程由 auth-session feature 维护。
function AuthenticatedAppRoute() {
  return <AuthenticatedLayout withAppShell />;
}
