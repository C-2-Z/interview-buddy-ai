/** 密码恢复路由：仅注册设置新密码页面壳。 */
import { createFileRoute } from "@tanstack/react-router";
import { PasswordRecoveryPage } from "@/features/password-recovery/components/password-recovery-page";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "设置新密码 · AI 面试模拟器" }] }),
  component: PasswordRecoveryPage,
});
