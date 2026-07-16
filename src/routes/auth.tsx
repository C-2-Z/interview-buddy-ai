/** 登录路由：仅注册认证页面壳。 */
import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth-login/components/auth-page";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "登录 · AI 面试模拟器" }] }),
  component: AuthPage,
});
