/** Supabase 浏览器端客户端 */
import { createClient } from "@supabase/supabase-js";
import { platformAdapter } from "@/shared/platform/platform-adapter";
import { runtimeConfig } from "@/shared/runtime/runtime-config";
import { isTauri } from "@/shared/platform/env-detect";

/**
 * passthrough 获取
 *
 * @param input -
 * @param init -
 * @returns
 */
function passthroughFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

/**
 * 创建 supabase client
 * @returns
 */
function createSupabaseClient() {
  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
    throw new Error(message);
  }

  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: passthroughFetch,
    },
    auth: {
      flowType: isTauri() ? "pkce" : "implicit",
      storage: platformAdapter.getAuthStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
