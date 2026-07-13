/** auth-session：读取浏览器中的 Supabase 登录用户。 */
import { supabase } from "@/integrations/supabase/client";

/**
 * 读取当前登录用户，统一认证布局与轻量账户菜单的会话真相。
 *
 * @returns 已登录用户；会话缺失或失效时返回 null。
 */
export async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
