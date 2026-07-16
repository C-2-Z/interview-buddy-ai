/** auth-session：读取浏览器中的 Supabase 登录用户。 */
import { supabase } from "@/integrations/supabase/client";

/**
 * 从持久化存储恢复本地会话用户，避免等待网络校验后才渲染应用。
 *
 * @returns 本地会话中的用户；会话缺失或读取失败时返回 null。
 */
export async function getLocalSessionUser() {
  const { data, error } = await supabase.auth.getSession();
  return error ? null : (data.session?.user ?? null);
}

/**
 * 读取当前登录用户，统一认证布局与轻量账户菜单的会话真相。
 *
 * @returns 已登录用户；会话缺失或失效时返回 null。
 */
export async function getVerifiedUser() {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
