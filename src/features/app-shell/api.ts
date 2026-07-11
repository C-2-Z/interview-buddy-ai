/** 应用外壳：侧边栏导航 - API 调用函数 */
import { supabase } from "@/integrations/supabase/client";

/**
 * 签名 out
 * @returns Promise<
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
