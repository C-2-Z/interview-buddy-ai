/** Tauri 深链回调事件的参数类型。 */

/** 来自 Tauri 深链插件的回调负载。 */
export type DeepLinkPayload = Readonly<{
  /** 完整回调 URL，例如 interviewbuddy://auth/callback?code=xxx */
  url: string;
}>;

/** Auth deep link 解析后的会话信息。 */
export type AuthCallbackParams = Readonly<{
  /** Supabase PKCE 授权码。 */
  code: string;
  /** 用于验证 PKCE 流的 state 参数。 */
  state?: string;
}>;
