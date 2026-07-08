import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { encrypt, decrypt, maskApiKey } from "../lib/encryption.js";

const settings = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../lib/supabase.js").createUserClient> };
}>();

settings.use("*", requireAuth);

/**
 * Column names in user_settings that store encrypted API keys.
 */
const KEY_COLUMNS = [
  "deepseek_api_key",
  "openai_api_key",
  "anthropic_api_key",
] as const;

/**
 * GET /api/settings — Return the current user's saved preferences.
 * API keys are NOT sent back in full — only masked previews for display.
 */
settings.get("/", async (c) => {
  const supabase = c.var.supabase;
  const { data, error } = await supabase
    .from("user_settings" as any)
    .select("model_provider, model_name, deepseek_api_key, openai_api_key, anthropic_api_key")
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows (settings not created yet, which shouldn't happen)
    return c.json({ error: error.message }, 500);
  }

  const row = data ?? {};

  // Build key status responses — masked previews only, never the full key
  const keys: Record<string, { set: boolean; masked: string | null }> = {};
  for (const col of KEY_COLUMNS) {
    const encrypted = (row as Record<string, string | null>)[col] ?? null;
    let plaintext: string | null = null;
    if (encrypted) {
      try { plaintext = decrypt(encrypted); } catch { /* corrupted — ignore */ }
    }
    keys[col.replace("_api_key", "")] = {
      set: !!encrypted,
      masked: plaintext ? maskApiKey(plaintext) : null,
    };
  }

  return c.json({
    model_provider: (row as Record<string, string | null>).model_provider ?? "deepseek",
    model_name: (row as Record<string, string | null>).model_name ?? null,
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
 *   - Non-empty string → encrypt and store
 *   - Empty string or null → remove from storage (set to NULL)
 *   - Not present → leave unchanged
 */
settings.put("/", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

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

  // Build the update payload
  const update: Record<string, string | null> = {};
  if (body.model_provider !== undefined) update.model_provider = body.model_provider;
  if (body.model_name !== undefined) update.model_name = body.model_name;

  // Encrypt or clear keys
  if (body.keys) {
    for (const col of KEY_COLUMNS) {
      const provider = col.replace("_api_key", "");
      const value = (body.keys as Record<string, string | undefined>)[provider];
      if (value !== undefined) {
        update[col] = value.length > 0 ? encrypt(value) : null;
      }
    }
  }

  // Only update if there's something to change
  if (Object.keys(update).length === 0) {
    return c.json({ message: "没有需要更新的内容" });
  }

  update.updated_at = new Date().toISOString();

  // Upsert — insert if not exists, update if exists
  const { error } = await supabase
    .from("user_settings" as any)
    .upsert({ user_id: userId, ...update } as any)
    .select("model_provider, model_name")
    .single();

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ message: "设置已保存" });
});

export { settings };
