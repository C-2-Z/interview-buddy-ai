/** 跨端运行时配置测试：锁定 Web 同源、Native HTTPS 与 WebSocket 规则。 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiUrl, resolveRuntimeConfig, resolveWebSocketUrl } from "./runtime-config";

/** 创建不依赖真实环境变量的测试配置。 */
function config(target: "web" | "native", apiBaseUrl: string, production = false) {
  return resolveRuntimeConfig({ target, apiBaseUrl, production });
}

test("Web keeps same-origin API paths when no base URL is configured", () => {
  assert.equal(resolveApiUrl(config("web", ""), "/api/health"), "/api/health");
});

test("runtime config trims trailing slashes before joining API paths", () => {
  assert.equal(
    resolveApiUrl(config("native", "https://api.example.com///"), "api/health"),
    "https://api.example.com/api/health",
  );
});

test("Native requires an absolute API URL and production requires HTTPS", () => {
  assert.throws(() => config("native", ""), /必须配置/);
  assert.throws(() => config("native", "/api"), /绝对/);
  assert.throws(() => config("native", "http://10.0.2.2:3001", true), /HTTPS/);
  assert.doesNotThrow(() => config("native", "https://api.example.com", true));
});

test("WebSocket URLs convert HTTP protocols and preserve signed query values", () => {
  const native = config("native", "https://api.example.com", true);
  assert.equal(
    resolveWebSocketUrl(native, "/api/voice/ws?token=signed"),
    "wss://api.example.com/api/voice/ws?token=signed",
  );
  assert.equal(
    resolveWebSocketUrl(native, "https://voice.example.com/ws?token=signed"),
    "wss://voice.example.com/ws?token=signed",
  );
});

test("production rejects insecure WebSocket URLs", () => {
  assert.throws(
    () => resolveWebSocketUrl(config("web", "https://api.example.com", true), "ws://x/ws"),
    /WSS/,
  );
});
