/** 全局深链处理组件：在 __root.tsx 中挂载，自动处理 auth callback。 */
import { useNavigate } from "@tanstack/react-router";
import { exchangeAuthCodeForSession } from "../api";
import { useDeepLink } from "../hooks/use-deep-link";
import type { AuthCallbackParams } from "../types";

/**
 * 解析 interviewbuddy://auth/callback?code=xxx 格式的 URL。
 */
function parseAuthCallbackUrl(url: string): AuthCallbackParams | null {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");
    if (!code) return null;
    return { code, state: state ?? undefined };
  } catch {
    return null;
  }
}

/**
 * 深链处理器组件：监听 interviewbuddy:// 协议的回调，
 * 完成 Supabase 会话交换后跳转到主页。
 *
 * 仅在 Tauri 平台中生效，无 UI 输出。
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useDeepLink(async (payload) => {
    const params = parseAuthCallbackUrl(payload.url);
    if (!params) return;
    const ok = await exchangeAuthCodeForSession(params);
    if (ok) {
      navigate({ to: "/interview-hub", replace: true });
    }
  });

  return null;
}
