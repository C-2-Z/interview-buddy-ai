/** API CORS 配置的本地开发与未知来源边界测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import app from "../app.js";

/**
 * 发送一次浏览器预检请求并读取允许来源响应头。
 *
 * @param origin - 浏览器请求携带的来源。
 * @returns 服务端允许的来源；未授权时为 null。
 */
async function preflight(origin: string): Promise<string | null> {
  const response = await app.request("/api/health", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,last-event-id",
    },
  });
  return response.headers.get("access-control-allow-origin");
}

test("Vite default development origin is allowed", async () => {
  assert.equal(
    await preflight("http://localhost:5173"),
    "http://localhost:5173",
  );
});

test("unknown origins are not reflected", async () => {
  assert.notEqual(
    await preflight("https://untrusted.example"),
    "https://untrusted.example",
  );
});

test("authorized event streams may resume with Last-Event-ID", async () => {
  const response = await app.request("/api/health", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,last-event-id",
    },
  });
  assert.match(
    response.headers.get("access-control-allow-headers") ?? "",
    /last-event-id/i,
  );
});
