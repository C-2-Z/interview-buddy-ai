/** password-recovery：组合恢复会话检查、新密码表单与完成结果。 */
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePasswordRecovery } from "../hooks/use-password-recovery";
import { ResetPasswordForm } from "./reset-password-form";

/** 根据恢复状态渲染加载、无效链接、密码输入或完成提示。 */
export function PasswordRecoveryPage() {
  const recovery = usePasswordRecovery();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>设置新密码</CardTitle>
          <CardDescription>使用一个新的安全密码登录 AI 面试模拟器</CardDescription>
        </CardHeader>
        <CardContent>
          {recovery.step === "checking" && (
            <p className="text-sm text-muted-foreground">正在验证恢复链接…</p>
          )}
          {recovery.step === "invalid" && (
            <div className="space-y-4 text-sm">
              <p className="text-destructive">恢复链接无效或已过期，请重新申请。</p>
              <Link to="/auth" className="text-primary hover:underline">
                返回登录页
              </Link>
            </div>
          )}
          {(recovery.step === "ready" || recovery.step === "submitting") && (
            <ResetPasswordForm
              onSubmit={recovery.submitPassword}
              loading={recovery.step === "submitting"}
              errorMessage={recovery.errorMessage}
            />
          )}
          {recovery.step === "complete" && (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">密码已更新，请使用新密码登录。</p>
              <Link to="/auth" className="text-primary hover:underline">
                返回登录页
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
