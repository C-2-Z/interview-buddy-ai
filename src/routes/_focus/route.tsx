/** 专注布局：保留认证但移除应用侧栏和顶部导航。 */
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedLayout } from "@/features/auth-session/components/authenticated-layout";

export const Route = createFileRoute("/_focus")({
  ssr: false,
  component: FocusRoute,
});

// 专注路由仅选择无 AppShell 的认证布局。
function FocusRoute() {
  return <AuthenticatedLayout withAppShell={false} />;
}
