/** 全局深链处理组件：在 __root.tsx 中挂载，自动处理 auth callback。 */
import { useNavigate } from "@tanstack/react-router";
import { PASSWORD_RECOVERY_MARKER } from "@/features/password-recovery/hooks/use-password-recovery";
import { exchangeAuthCodeForSession, parseAuthDeepLink } from "../api";
import { useDeepLink } from "../hooks/use-deep-link";

/**
 * 深链处理器组件：监听 interviewbuddy:// 协议的回调，
 * 完成 Supabase 会话交换后跳转到主页。
 *
 * 仅在 Tauri 平台中生效，无 UI 输出。
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useDeepLink(async (payload) => {
    const params = parseAuthDeepLink(payload.url);
    if (!params) return;
    const ok = await exchangeAuthCodeForSession(params);
    if (ok) {
      if (params.kind === "password-recovery") {
        window.sessionStorage.setItem(PASSWORD_RECOVERY_MARKER, "true");
        void navigate({ to: "/auth/reset-password", replace: true });
      } else {
        void navigate({ to: "/interview-hub", replace: true });
      }
    }
  });

  return null;
}
