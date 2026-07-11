/** 用户设置 DB 访问 */
export const KEY_COLUMNS = [
  "deepseek_api_key",
  "openai_api_key",
  "anthropic_api_key",
] as const;

export type ApiKeyColumn = (typeof KEY_COLUMNS)[number];

export type UserSettingsRow = {
  model_provider: string | null;
  model_name: string | null;
  deepseek_api_key: string | null;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
};

/**
 * 获取 user settings
 * @returns 
 */
export async function getUserSettings(
  supabase: any,
  userId: string,
): Promise<UserSettingsRow | null> {
  // Read settings from auth user_metadata instead of DB table
  // This avoids schema migration headaches and uses the built-in auth storage
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    /**
     * meta
     *
     * @param user_metadata - 
     * @param interview_settings - 
     * @returns 
     */
    const meta = (user.user_metadata?.interview_settings ?? {}) as Record<string, unknown>;
    return {
      model_provider: (meta.model_provider as string) ?? null,
      model_name: (meta.model_name as string) ?? null,
      deepseek_api_key: (meta.deepseek_api_key as string) ?? null,
      openai_api_key: (meta.openai_api_key as string) ?? null,
      anthropic_api_key: (meta.anthropic_api_key as string) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * upsert user settings
 * @returns 
 */
export async function upsertUserSettings(
  supabase: any,
  userId: string,
  update: Record<string, string | null>,
): Promise<void> {
  // Merge with existing settings and save to auth user_metadata
  const current = await getUserSettings(supabase, userId);
  const merged: Record<string, unknown> = { ...current, ...update };
  // Remove null values (kept separate to allow clearing keys)
  for (const [key, val] of Object.entries(update)) {
    if (val === null) {
      delete merged[key];
    } else {
      merged[key] = val;
    }
  }
  const { error } = await supabase.auth.updateUser({
    data: { interview_settings: merged },
  });
  if (error) throw new Error(error.message);
}
