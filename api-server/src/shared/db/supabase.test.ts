/** Supabase 客户端在 Railway Node 20 环境下的构造测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServiceClient } from "./supabase.js";

/** service role 客户端不能依赖 Node 22 才提供的全局 WebSocket。 */
test("service client injects a WebSocket transport when the runtime has no global WebSocket", () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: undefined,
  });

  try {
    assert.doesNotThrow(() => createServiceClient());
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "WebSocket", descriptor);
    else delete (globalThis as { WebSocket?: unknown }).WebSocket;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
});
