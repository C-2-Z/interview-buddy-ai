/** 多实例语音连接票据的加密、签名与一次性消费测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createVoiceSocketToken,
  verifyVoiceSocketToken,
  type VoiceSocketTicketRecord,
  type VoiceSocketTicketStore,
} from "./voice-token.service.js";

class MemoryTicketStore implements VoiceSocketTicketStore {
  readonly records = new Map<string, VoiceSocketTicketRecord>();

  /** 保存密文票据，模拟任意 API 实例可见的共享数据库。 */
  async issue(record: VoiceSocketTicketRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  /** 原子删除并返回票据，确保同一个 URL 只能成功一次。 */
  async consume(id: string): Promise<VoiceSocketTicketRecord | null> {
    const record = this.records.get(id) ?? null;
    this.records.delete(id);
    return record;
  }
}

/** 共享存储只保存加密访问令牌，且另一实例可完成一次性消费。 */
test("voice ticket is encrypted and consumable across instances once", async () => {
  process.env.VOICE_WS_TOKEN_SECRET = "voice-test-secret";
  process.env.ENCRYPTION_KEY = "11".repeat(32);
  const store = new MemoryTicketStore();
  const issued = await createVoiceSocketToken(
    { sessionId: "session-1", userId: "user-1", accessToken: "supabase-access-token" },
    store,
    1_000,
  );
  const record = [...store.records.values()][0];
  assert.ok(record);
  assert.equal(record.accessTokenCiphertext.includes("supabase-access-token"), false);

  const payload = await verifyVoiceSocketToken(issued.token, store, 2_000);
  assert.equal(payload?.accessToken, "supabase-access-token");
  assert.equal(await verifyVoiceSocketToken(issued.token, store, 2_001), null);
});

/** 过期票据在消费后仍被拒绝。 */
test("expired voice ticket is rejected", async () => {
  process.env.VOICE_WS_TOKEN_SECRET = "voice-test-secret";
  process.env.ENCRYPTION_KEY = "22".repeat(32);
  const store = new MemoryTicketStore();
  const issued = await createVoiceSocketToken(
    { sessionId: "session-1", userId: "user-1", accessToken: "token" },
    store,
    1_000,
  );
  assert.equal(await verifyVoiceSocketToken(issued.token, store, 122_001), null);
});
