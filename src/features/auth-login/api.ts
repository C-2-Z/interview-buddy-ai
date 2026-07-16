/** auth-login：封装现有登录、注册与当前用户读取。 */
import { supabase } from "@/integrations/supabase/client";
import { platformAdapter } from "@/shared/platform/platform-adapter";
import { getAuthRedirectUrl } from "@/shared/runtime/runtime-config";

/** 使用邮箱密码登录。 */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** 使用邮箱密码和昵称创建账号。 */
export async function signUp(email: string, password: string, name: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(platformAdapter.getCurrentOrigin()),
      data: { display_name: name || email.split("@")[0] },
    },
  });
  if (error) throw error;
}

/** 返回当前浏览器会话中的用户是否存在。 */
export async function hasAuthenticatedUser(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user);
}
