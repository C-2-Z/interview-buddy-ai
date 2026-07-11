/**（旧）设置路由兼容导出 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.js";

const settings = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../lib/supabase.js").createUserClient> };
}>();

settings.use("*", requireAuth);

/**
 * Provider names matching the keys object structure.
 */
const PROVIDERS = ["deepseek", "openai", "anthropic"] as const;

/**
 * GET /api/settings — Return the current user's saved preferences.
 * API keys are NOT sent back in full — only masked previews for display.
 */
settings.get("/", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

  // Try using Auth metadata first (no DB table needed)
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return c.json({ error: "无法获取用户信息" }, 401);

  /**
   * meta
   *
   * @param user.user_metadata - 
   * @param unknown> - 
   * @returns 
   */
  const meta = (user.user_metadata?.interview_settings as Record<string, unknown>) ?? {};

  // Build key status — masked previews only, never the full key
  const keys: Record<string, { set: boolean; masked: string | null }> = {};
  for (const provider of PROVIDERS) {
    const encrypted = meta[`${provider}_api_key`] as string | null ?? null;
    let plaintext: string | null = null;
    if (encrypted) {
      try { plaintext = decrypt(encrypted); } catch { /* corrupted — ignore */ }
    }
    keys[provider] = {
      set: !!encrypted,
      masked: plaintext ? maskApiKey(plaintext) : null,
    };
  }

  return c.json({
    model_provider: (meta.model_provider as string) ?? "deepseek",
    model_name: (meta.model_name as string) ?? null,
    keys,
  });
});

/**
 * PUT /api/settings — Update user preferences and/or API keys.
 *
 * Body (all optional):
 *   model_provider?: string
 *   model_name?: string | null
 *   keys?: { deepseek?: string, openai?: string, anthropic?: string }
 *
 * For each key in `keys`:
 *   - Non-empty string  → encrypt and store
 *   - Empty string      → remove
 *   - Not present       → leave unchanged
 */
settings.put("/", async (c) => {
  const supabase = c.var.supabase;

  const schema = z.object({
    model_provider: z.enum(["deepseek", "openai", "anthropic"]).optional(),
    model_name: z.string().trim().max(100).nullable().optional(),
    keys: z
      .object({
        deepseek: z.string().max(500).optional(),
        openai: z.string().max(500).optional(),
        anthropic: z.string().max(500).optional(),
      })
      .optional(),
  });

  const body = schema.parse(await c.req.json());

  // Get current settings from auth metadata
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "无法获取用户信息" }, 401);
  /**
   * current meta
   *
   * @param user.user_metadata - 
   * @param unknown> - 
   * @returns 
   */
  const currentMeta = (user.user_metadata?.interview_settings as Record<string, unknown>) ?? {};

  // Merge with new values
  const newMeta: Record<string, unknown> = { ...currentMeta };
  if (body.model_provider !== undefined) newMeta.model_provider = body.model_provider;
  if (body.model_name !== undefined) newMeta.model_name = body.model_name;

  // Encrypt / clear keys
  if (body.keys) {
    for (const provider of PROVIDERS) {
      const value = body.keys[provider];
      if (value !== undefined) {
        newMeta[`${provider}_api_key`] = value.length > 0 ? encrypt(value) : null;
      }
    }
  }

  const { error } = await supabase.auth.updateUser({
    data: { interview_settings: newMeta },
  });

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ message: "设置已保存" });
});

export { settings };
