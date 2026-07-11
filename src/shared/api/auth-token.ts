/** Supabase Auth token 获取：SSR 兼容的 getAccessToken */
import { supabase } from "@/integrations/supabase/client";

/**
 * 获取 access token
 * @returns Promise<
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

