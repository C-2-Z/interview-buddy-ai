/** HTTP 共享模块：验证 Hono 子路由仅在首次命中时加载。 */
import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createLazyRoute } from "./lazy-route.js";

test("lazy route loads its child only on the first request", async () => {
  let loadCalls = 0;
  const route = createLazyRoute(async () => {
    loadCalls += 1;
    const child = new Hono();
    child.get("/hello", (context) => context.json({ status: "ok" }));
    return child;
  });

  assert.equal(loadCalls, 0);
  const response = await route.request("/hello");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(loadCalls, 1);
});

test("concurrent first requests share one route load", async () => {
  let loadCalls = 0;
  let releaseLoad: (() => void) | undefined;
  const loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  const route = createLazyRoute(async () => {
    loadCalls += 1;
    await loadGate;
    const child = new Hono();
    child.get("/shared", (context) => context.text("shared"));
    return child;
  });

  const firstRequest = route.request("/shared");
  const secondRequest = route.request("/shared");
  await Promise.resolve();
  assert.equal(loadCalls, 1);

  releaseLoad?.();
  const responses = await Promise.all([firstRequest, secondRequest]);
  assert.deepEqual(
    await Promise.all(responses.map((response) => response.text())),
    ["shared", "shared"],
  );
});

test("failed route load is cleared so a later request can retry", async () => {
  let loadCalls = 0;
  const route = createLazyRoute(async () => {
    loadCalls += 1;
    if (loadCalls === 1) throw new Error("temporary import failure");
    const child = new Hono();
    child.get("/retry", (context) => context.text("recovered"));
    return child;
  });
  route.onError(() => new Response("load failed", { status: 500 }));

  const failedResponse = await route.request("/retry");
  assert.equal(failedResponse.status, 500);
  const response = await route.request("/retry");

  assert.equal(await response.text(), "recovered");
  assert.equal(loadCalls, 2);
});
