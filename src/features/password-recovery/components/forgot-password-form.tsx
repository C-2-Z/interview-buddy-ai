/** password-recovery：渲染重置邮件申请表单与中性成功反馈。 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { platformAdapter } from "@/shared/platform/platform-adapter";
import { requestPasswordReset } from "../api";
import { PASSWORD_RESET_SENT_MESSAGE } from "../constants";

/** 忘记密码表单参数。 */
export type ForgotPasswordFormProps = Readonly<{
  /** 从登录表单保留的邮箱。 */
  initialEmail?: string;
  /** 返回登录模式时调用。 */
  onBack: () => void;
}>;

/** 用户申请重置邮件时渲染，并在成功后隐藏邮箱是否存在。 */
export function ForgotPasswordForm({ initialEmail = "", onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** 提交邮箱并显示不泄露账号状态的结果。 */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      await requestPasswordReset(email, platformAdapter.getCurrentOrigin());
      setSent(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法发送重置邮件");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-md bg-muted p-3 text-muted-foreground">
          {PASSWORD_RESET_SENT_MESSAGE}
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={onBack}>
          返回登录
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="recovery-email">邮箱</Label>
        <Input
          id="recovery-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "正在发送…" : "发送重置邮件"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        返回登录
      </Button>
    </form>
  );
}
