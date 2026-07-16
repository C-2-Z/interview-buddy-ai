/** profile：用户资料数据库访问 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
export type ProfileRow = { id: string; display_name: string | null; avatar_path: string | null };
/** 查询当前用户资料。 */
export async function getProfile(supabase: UserSupabaseClient, userId: string) {
  const { data, error } = await supabase.from("profiles").select("id, display_name, avatar_path").eq("id", userId).maybeSingle();
  if (error && /avatar_path|column .* does not exist/i.test(error.message)) {
    const fallback = await supabase.from("profiles").select("id, display_name").eq("id", userId).maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    return { ...(fallback.data as Omit<ProfileRow, "avatar_path">), avatar_path: null };
  }
  if (error) throw new Error(error.message);
  return data as ProfileRow | null;
}
/** 更新当前用户资料。 */
export async function updateProfile(supabase: UserSupabaseClient, userId: string, values: Partial<Pick<ProfileRow, "display_name" | "avatar_path">>) {
  const { error } = await supabase.from("profiles").update(values).eq("id", userId);
  if (error) throw new Error(error.message);
}
