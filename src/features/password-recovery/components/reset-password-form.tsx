/** password-recovery：渲染新密码确认表单并执行本地校验。 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateNewPassword } from "../validation";

/** 设置新密码表单参数。 */
export type ResetPasswordFormProps = Readonly<{
  /** Supabase 更新密码动作。 */
  onSubmit: (password: string) => Promise<void>;
  /** 是否正在提交。 */
  loading: boolean;
  /** 供应商调用失败后的安全错误。 */
  errorMessage: string | null;
}>;

/** 恢复会话有效时渲染两次密码输入，校验通过后才提交。 */
export function ResetPasswordForm({ onSubmit, loading, errorMessage }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  /** 校验两次输入后提交新密码。 */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = validateNewPassword(password, confirmation);
    setValidationMessage(message);
    if (message) return;
    await onSubmit(password);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">新密码</Label>
        <Input
          id="new-password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">确认新密码</Label>
        <Input
          id="confirm-password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
      {(validationMessage || errorMessage) && (
        <p className="text-sm text-destructive">{validationMessage || errorMessage}</p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "正在更新…" : "设置新密码"}
      </Button>
    </form>
  );
}
