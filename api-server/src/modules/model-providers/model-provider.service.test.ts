/** 模型供应商解析服务的用户 Key 优先与服务端兜底测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {encrypt} from "../settings/encryption.service.js";
import {resolveProviderForCreation,resolveProviderForSession} from "./model-provider.service.js";

/**
 * 创建只返回指定用户设置元数据的 Supabase 测试替身。
 *
 * @param interviewSettings - 模拟用户保存的供应商设置。
 * @returns 满足模型解析服务所需最小接口的测试客户端。
 */
function fakeSupabase(interviewSettings: Record<string, unknown> = {}) {
  return {
    auth: {
      async getUser() {
        return {
          data: { user: { user_metadata: { interview_settings: interviewSettings } } },
          error: null,
        };
      },
    },
  } as never;
}

/**
 * 临时覆盖单个环境变量并在测试完成后恢复原值。
 *
 * @param name - 需要覆盖的环境变量名。
 * @param value - 测试期间使用的值。
 * @param run - 在临时环境中执行的异步断言。
 * @returns 断言流程完成时解决。
 */
async function withEnvironment(
  name: string,
  value: string,
  run: () => Promise<void>,
): Promise<void> {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("server DeepSeek key makes default creation usable without BYOK", async () => {
  await withEnvironment("DEEPSEEK_API_KEY", "server-key", async () => {
    const provider = await resolveProviderForCreation(fakeSupabase(), "user-1", {});
    assert.equal(provider.name, "deepseek");
    assert.equal(provider.apiKey, "server-key");
  });
});

test("encrypted user key takes priority over server default", async () => {
  await withEnvironment("ENCRYPTION_KEY", "11".repeat(32), async () =>
    withEnvironment("DEEPSEEK_API_KEY", "server-key", async () => {
      const provider = await resolveProviderForCreation(
        fakeSupabase({ deepseek_api_key: encrypt("user-key") }),
        "user-1",
        { modelProvider: "deepseek" },
      );
      assert.equal(provider.apiKey, "user-key");
    }),
  );
});

test("resumed sessions also use server fallback without persisting it", async () => {
  await withEnvironment("OPENAI_API_KEY", "server-openai", async () => {
    const provider = await resolveProviderForSession(fakeSupabase(), "user-1", {
      model_provider: "openai",
      model_name: null,
      user_api_key: null,
    });
    assert.equal(provider.apiKey, "server-openai");
  });
});
