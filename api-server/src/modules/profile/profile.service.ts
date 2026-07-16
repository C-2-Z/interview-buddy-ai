/** profile：昵称和头像业务流程 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { getProfile, updateProfile } from "./profile.repository.js";
import type { UpdateProfileInput } from "./profile.schemas.js";
const BUCKET = "avatars";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
/** 读取资料并生成头像 URL。 */
export async function readProfile(supabase: UserSupabaseClient, userId: string) {
  const row = await getProfile(supabase, userId);
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";
  return { displayName: row?.display_name || email.split("@")[0] || "", avatarUrl: row?.avatar_path ? supabase.storage.from(BUCKET).getPublicUrl(row.avatar_path).data.publicUrl : null, email };
}
/** 保存昵称。 */
export async function saveProfile(supabase: UserSupabaseClient, userId: string, input: UpdateProfileInput) {
  await updateProfile(supabase, userId, { display_name: input.displayName.trim() });
  return { message: "个人资料已保存" };
}
/** 校验并上传头像。 */
export async function uploadAvatar(supabase: UserSupabaseClient, userId: string, file: File) {
  if (!ALLOWED.has(file.type)) throw new Error("头像仅支持 JPEG、PNG 或 WebP");
  if (file.size > 2 * 1024 * 1024) throw new Error("头像大小不能超过 2 MB");
  const path = `${userId}/avatar.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  try { await updateProfile(supabase, userId, { avatar_path: path }); } catch (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
  return { message: "头像已更新", avatarUrl: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
/** 删除头像。 */
export async function removeAvatar(supabase: UserSupabaseClient, userId: string) {
  const row = await getProfile(supabase, userId);
  if (row?.avatar_path) { const { error } = await supabase.storage.from(BUCKET).remove([row.avatar_path]); if (error) throw new Error(error.message); }
  await updateProfile(supabase, userId, { avatar_path: null });
  return { message: "头像已移除" };
}
