import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { platformAdapter } from "@/shared/platform/platform-adapter";
import { getAuthRedirectUrl } from "@/shared/runtime/runtime-config";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "登录 · AI 面试模拟器" }] }),
  component: AuthPage,
});

/**
 * 认证 page
 * @returns
 */
function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/interview-hub", replace: true });
    });
  }, [navigate]);

  /**
   * 提交
   *
   * @param e -
   * @returns Promise<
   */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(platformAdapter.getCurrentOrigin()),
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("注册成功，正在登录…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/interview-hub", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            AI 面试模拟器
          </Link>
          <p className="text-sm text-muted-foreground mt-1">练习面试，获得 AI 反馈</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{mode === "signin" ? "登录" : "注册"}</CardTitle>
            <CardDescription>
              {mode === "signin" ? "使用邮箱和密码登录" : "创建一个新账号"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">昵称</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "处理中…" : mode === "signin" ? "登录" : "注册"}
              </Button>
            </form>
            <div className="text-center mt-4 text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  还没有账号？{" "}
                  <button
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
                    className="text-primary hover:underline"
                    onClick={() => setMode("signin")}
                  >
                    去登录
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
