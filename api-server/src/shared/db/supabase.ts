/** Supabase 客户端工厂 */
import { createClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import type { Database } from "../../lib/supabase-types.js";
import { getRequiredEnv } from "../../config/env.js";

/**
 * 判断 new supabase api key
 *
 * @param value - 
 * @returns 
 */
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * 创建 supabase 获取
 *
 * @param supabaseKey - 
 * @returns 
 */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) =>
        headers.set(key, value),
      );
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * 创建 user client
 *
 * @param token - 
 * @returns 
 */
export function createUserClient(token: string) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const publishableKey = getRequiredEnv("SUPABASE_PUBLISHABLE_KEY");

  return createClient<Database>(supabaseUrl, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: WebSocket as any,
    },
  });
}

export type UserSupabaseClient = ReturnType<typeof createUserClient>;

