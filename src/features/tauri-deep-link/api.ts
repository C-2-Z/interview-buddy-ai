/** 深链回调：使用 PKCE 授权码交换 Supabase 会话。 */
import { supabase } from "@/integrations/supabase/client";
import type { AuthCallbackParams, AuthDeepLink } from "./types";

/**
 * 解析经过白名单约束的应用认证深链。
 *
 * @param value - 操作系统传入的完整 URL。
 * @returns 可安全使用的流程类型与 PKCE 参数；非法地址返回 null。
 */
export function parseAuthDeepLink(value: string): AuthDeepLink | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "interviewbuddy:" || url.hostname !== "auth") return null;
    const kind =
      url.pathname === "/reset-password"
        ? "password-recovery"
        : url.pathname === "/callback"
          ? "auth-callback"
          : null;
    const code = url.searchParams.get("code");
    if (!kind || !code) return null;
    const state = url.searchParams.get("state");
    return state ? { kind, code, state } : { kind, code };
  } catch {
    return null;
  }
}

/**
 * 从深链回调中提取 PKCE 授权码并交换为 Supabase 会话。
 * 仅在 Tauri 平台中调用，浏览器版使用标准的 PKCE redirect 流程。
 *
 * @param params - 从深链 URL 解析的授权参数。
 * @returns 交换成功时返回 true。
 */
export async function exchangeAuthCodeForSession(params: AuthCallbackParams): Promise<boolean> {
  const { error } = await supabase.auth.exchangeCodeForSession(params.code);
  return !error;
}
