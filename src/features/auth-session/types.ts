/** auth-session：客户端认证检查的稳定状态类型。 */
import type { User } from "@supabase/supabase-js";

/** 客户端认证守卫向页面暴露的状态。 */
export type AuthSessionState = Readonly<{
  /** 已验证的 Supabase 用户。 */
  user: User | null;
  /** 是否仍在读取本地登录态。 */
  checking: boolean;
}>;
