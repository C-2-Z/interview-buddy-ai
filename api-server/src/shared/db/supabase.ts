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
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
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
      // ws 满足 Realtime 运行时接口，但其事件声明与 DOM WebSocket 不完全一致。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 第三方构造器仅声明层不兼容
      transport: WebSocket as any,
    },
  });
}

export function createServiceClient() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      // Railway 当前使用 Node 20；显式 transport 避免 Supabase 构造时依赖 Node 22 全局 WebSocket。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ws 与 DOM WebSocket 仅类型声明不同
      transport: WebSocket as any,
    },
  });
}

export type UserSupabaseClient = ReturnType<typeof createUserClient>;
export type ServiceSupabaseClient = ReturnType<typeof createServiceClient>;
