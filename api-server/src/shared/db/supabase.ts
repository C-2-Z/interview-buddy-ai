/** Supabase 客户端工厂 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase-types.js";
import { getRequiredEnv } from "../../config/env.js";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

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
  });
}

export type UserSupabaseClient = ReturnType<typeof createUserClient>;

