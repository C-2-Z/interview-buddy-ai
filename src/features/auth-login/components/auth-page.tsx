/** auth-login：渲染登录、注册和忘记密码入口。 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForgotPasswordForm } from "@/features/password-recovery/components/forgot-password-form";
import { signIn, signUp } from "../api";
import { useAuthUserRedirect } from "../hooks/use-auth-user-redirect";
import type { AuthMode } from "../types";

/** 根据用户选择渲染登录、注册或重置邮件申请表单。 */
export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  useAuthUserRedirect();

  /** 提交登录或注册表单并进入面试工作台。 */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, name);
        toast.success("注册成功，正在登录…");
      } else {
        await signIn(email, password);
      }
      await navigate({ to: "/interview-hub", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "signin" ? "登录" : mode === "signup" ? "注册" : "忘记密码";
  const description =
    mode === "signin"
      ? "使用邮箱和密码登录"
      : mode === "signup"
        ? "创建一个新账号"
        : "输入注册邮箱，我们会发送密码重置链接";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            AI 面试模拟器
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">练习面试，获得 AI 反馈</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "forgot-password" ? (
              <ForgotPasswordForm initialEmail={email} onBack={() => setMode("signin")} />
            ) : (
              <>
                <form onSubmit={submit} className="space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="name">昵称</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="您的昵称"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">密码</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => setMode("forgot-password")}
                        >
                          忘记密码？
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "处理中…" : mode === "signin" ? "登录" : "注册"}
                  </Button>
                </form>
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  {mode === "signin" ? (
                    <>
                      还没有账号？{" "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setMode("signup")}
                      >
                        立即注册
                      </button>
                    </>
                  ) : (
                    <>
                      已有账号？{" "}
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => setMode("signin")}
                      >
                        去登录
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
