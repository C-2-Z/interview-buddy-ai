/** 平台适配器测试：锁定 SSR/无设备能力时的安全降级。 */
import assert from "node:assert/strict";
import test from "node:test";
import { createWebPlatformAdapter } from "./platform-adapter";

test("platform adapter preserves its build target", () => {
  assert.equal(createWebPlatformAdapter("web").target, "web");
  assert.equal(createWebPlatformAdapter("native").target, "native");
});

test("platform adapter safely degrades without a browser document", async () => {
  const adapter = createWebPlatformAdapter("native");
  assert.equal(adapter.getAuthStorage(), undefined);
  assert.equal(adapter.getCurrentOrigin(), "");
  assert.equal(adapter.voice.isSecureContext(), false);
  assert.equal(adapter.voice.isMicrophoneSupported(), false);
  assert.equal(adapter.display.isFullscreenSupported(), false);
  assert.equal(adapter.display.isFullscreenActive(), false);
  assert.equal(adapter.display.getVisibilityState(), "hidden");
  assert.equal(await adapter.display.requestWakeLock(), null);
  await assert.rejects(() => adapter.voice.requestMicrophone({}), /不支持/);
});
