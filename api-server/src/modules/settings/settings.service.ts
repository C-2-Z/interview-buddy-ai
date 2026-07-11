/** 用户设置业务逻辑：模型偏好、API Key 管理 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  decrypt,
  encrypt,
  maskApiKey,
} from "./encryption.service.js";
import {
  getUserSettings,
  KEY_COLUMNS,
  upsertUserSettings,
} from "./settings.repository.js";
import type { UpdateSettingsInput } from "./settings.schemas.js";


/** 获取用户设置：模型偏好 + API Key 配置 */
export async function getSettings(
  supabase: UserSupabaseClient,
  userId: string,
) {
  const row = await getUserSettings(supabase, userId);

  const keys: Record<string, { set: boolean; masked: string | null }> = {};
  for (const col of KEY_COLUMNS) {
    const encrypted = row?.[col] ?? null;
    let plaintext: string | null = null;
    if (encrypted) {
      try {
        plaintext = decrypt(encrypted);
      } catch {
        plaintext = null;
      }
    }
    keys[col.replace("_api_key", "")] = {
      set: !!encrypted,
      masked: plaintext ? maskApiKey(plaintext) : null,
    };
  }

  return {
    model_provider: row?.model_provider ?? "deepseek",
    model_name: row?.model_name ?? null,
    keys,
  };
}


/** 更新用户设置：保存偏好并加密 API Key */
export async function updateSettings(
  supabase: UserSupabaseClient,
  userId: string,
  body: UpdateSettingsInput,
): Promise<{ message: string }> {
  const update: Record<string, string | null> = {};
  if (body.model_provider !== undefined) update.model_provider = body.model_provider;
  if (body.model_name !== undefined) update.model_name = body.model_name;

  if (body.keys) {
    for (const col of KEY_COLUMNS) {
      const provider = col.replace("_api_key", "");
      const value = body.keys[provider as keyof typeof body.keys];
      if (value !== undefined) {
        update[col] = value.length > 0 ? encrypt(value) : null;
      }
    }
  }

  if (Object.keys(update).length === 0) {
    return { message: "没有需要更新的内容" };
  }

  await upsertUserSettings(supabase, userId, update);
  return { message: "设置已保存" };
}

