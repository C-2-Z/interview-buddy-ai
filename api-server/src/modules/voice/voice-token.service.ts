/** WebSocket 连接 JWT 令牌 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getRequiredEnv } from "../../config/env.js";
import { decrypt, encrypt } from "../settings/encryption.service.js";
import { createVoiceSocketTicketStore } from "./voice-token.repository.js";

const TOKEN_TTL_MS = 2 * 60 * 1000;

/** 共享存储中的加密票据记录。 */
export type VoiceSocketTicketRecord = {
  /** 随机票据 UUID。 */ id: string;
  /** 所属用户 UUID。 */ userId: string;
  /** 所属语音会话 UUID。 */ sessionId: string;
  /** AES-256-GCM 加密的 Supabase Access Token。 */ accessTokenCiphertext: string;
  /** 过期 Unix 毫秒。 */ expiresAt: number;
};

/** 支持多实例的一次性票据存储契约。 */
export type VoiceSocketTicketStore = {
  /** 写入新票据。 */ issue(record: VoiceSocketTicketRecord): Promise<void>;
  /** 原子删除并返回票据。 */ consume(id: string): Promise<VoiceSocketTicketRecord | null>;
};

export type VoiceSocketTokenPayload = {
  sessionId: string;
  userId: string;
  accessToken: string;
  exp: number;
};

/**
 * 签名
 *
 * @param payload -
 * @returns
 */
function sign(payload: string): string {
  return createHmac("sha256", getRequiredEnv("VOICE_WS_TOKEN_SECRET"))
    .update(payload)
    .digest("base64url");
}

/**
 * 创建 voice socket token
 * @returns
 */
export async function createVoiceSocketToken(params: {
  sessionId: string;
  userId: string;
  accessToken: string;
}, store: VoiceSocketTicketStore = createVoiceSocketTicketStore(), now = Date.now()): Promise<{ token: string; expiresAt: string }> {
  const exp = now + TOKEN_TTL_MS;
  const id = randomUUID();
  await store.issue({
    id,
    sessionId: params.sessionId,
    userId: params.userId,
    accessTokenCiphertext: encrypt(params.accessToken),
    expiresAt: exp,
  });
  const signature = sign(id);
  return {
    token: `${id}.${signature}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/**
 * 验证 voice socket token
 * @returns
 */
export async function verifyVoiceSocketToken(
  token: string | null,
  store: VoiceSocketTicketStore = createVoiceSocketTicketStore(),
  now = Date.now(),
): Promise<VoiceSocketTokenPayload | null> {
  if (!token) return null;
  const [id, signature] = token.split(".");
  if (!id || !signature) return null;

  const expected = sign(id);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  const issued = await store.consume(id);
  if (!issued?.sessionId || !issued.userId || !issued.accessTokenCiphertext) return null;
  if (issued.expiresAt < now) return null;
  return {
    sessionId: issued.sessionId,
    userId: issued.userId,
    accessToken: decrypt(issued.accessTokenCiphertext),
    exp: issued.expiresAt,
  };
}
