/** 深链回调：使用 PKCE 授权码交换 Supabase 会话。 */
import { supabase } from "@/integrations/supabase/client";
import type { AuthCallbackParams } from "./types";

/**
 * 从深链回调中提取 PKCE 授权码并交换为 Supabase 会话。
 * 仅在 Tauri 平台中调用，浏览器版使用标准的 PKCE redirect 流程。
 *
 * @param params - 从深链 URL 解析的授权参数。
 * @returns 交换成功时返回 true。
 */
export async function exchangeAuthCodeForSession(params: AuthCallbackParams): Promise<boolean> {
  const { error } = await supabase.auth.exchangeCodeForSession(params.code);
  if (error) {
    console.error("[tauri-deep-link] 会话交换失败:", error.message);
    return false;
  }
  return true;
}
