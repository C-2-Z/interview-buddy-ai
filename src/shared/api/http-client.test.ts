/** 统一 API 传输层测试：验证 Token、JSON、上传、流式请求与稳定错误。 */
import assert from "node:assert/strict";
import test from "node:test";
import { createApiTransport, ApiRequestError } from "./http-client";
import { resolveRuntimeConfig } from "@/shared/runtime/runtime-config";

const config = resolveRuntimeConfig({ target: "native", apiBaseUrl: "https://api.example.com" });

test("JSON requests join the API URL and inject bearer authentication", async () => {
  let captured = new Request("https://placeholder.invalid");
  const transport = createApiTransport({
    getConfig: () => config,
    getToken: async () => "token",
    fetch: async (input, init) => {
      captured = new Request(input, init);
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(await transport.request("POST", "/api/test", { value: 1 }), { ok: true });
  assert.equal(captured.url, "https://api.example.com/api/test");
  assert.equal(captured.headers.get("authorization"), "Bearer token");
  assert.equal(captured.headers.get("content-type"), "application/json");
  assert.equal(await captured.text(), JSON.stringify({ value: 1 }));
});

test("FormData uploads preserve the browser-generated multipart boundary", async () => {
  let contentType: string | null = null;
  const transport = createApiTransport({
    getConfig: () => config,
    getToken: async () => null,
    fetch: async (input, init) => {
      contentType = new Request(input, init).headers.get("content-type");
      return Response.json({ id: "resume" });
    },
  });
  const body = new FormData();
  body.append("file", new Blob(["resume"]), "resume.txt");
  assert.deepEqual(await transport.upload("/api/resumes", body), { id: "resume" });
  assert.match(contentType ?? "", /^multipart\/form-data; boundary=/);
});

test("raw requests preserve SSE headers, Last-Event-ID and AbortSignal", async () => {
  const controller = new AbortController();
  let captured = new Request("https://placeholder.invalid");
  let capturedSignal: AbortSignal | null = null;
  const transport = createApiTransport({
    getConfig: () => config,
    getToken: async () => "stream-token",
    fetch: async (input, init) => {
      captured = new Request(input, init);
      capturedSignal = init?.signal ?? null;
      return new Response("data: {}\n\n");
    },
  });
  await transport.fetch("/api/events", {
    headers: { Accept: "text/event-stream", "Last-Event-ID": "7" },
    signal: controller.signal,
  });
  assert.equal(captured.headers.get("accept"), "text/event-stream");
  assert.equal(captured.headers.get("last-event-id"), "7");
  assert.equal(captured.headers.get("authorization"), "Bearer stream-token");
  assert.equal(capturedSignal, controller.signal);
});

test("HTTP and network failures use stable client errors", async () => {
  const httpTransport = createApiTransport({
    getConfig: () => config,
    getToken: async () => null,
    fetch: async () =>
      Response.json({ error: "暂时不可用", code: "unavailable", retryable: true }, { status: 503 }),
  });
  await assert.rejects(
    () => httpTransport.request("GET", "/api/test"),
    (error) =>
      error instanceof ApiRequestError &&
      error.status === 503 &&
      error.code === "unavailable" &&
      error.retryable,
  );

  const networkTransport = createApiTransport({
    getConfig: () => config,
    getToken: async () => null,
    fetch: async () => {
      throw new TypeError("socket details must stay private");
    },
  });
  await assert.rejects(
    () => networkTransport.fetch("/api/test"),
    (error) => error instanceof ApiRequestError && error.code === "network_error",
  );
});
