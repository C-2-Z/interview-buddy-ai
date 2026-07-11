/** WebSocket 连接 JWT 令牌 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getRequiredEnv } from "../../config/env.js";

const TOKEN_TTL_MS = 2 * 60 * 1000;
const issuedTokens = new Map<string, VoiceSocketTokenPayload>();

export type VoiceSocketTokenPayload = {
  sessionId: string;
  userId: string;
  accessToken: string;
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", getRequiredEnv("VOICE_WS_TOKEN_SECRET"))
    .update(payload)
    .digest("base64url");
}

export function createVoiceSocketToken(params: {
  sessionId: string;
  userId: string;
  accessToken: string;
}): { token: string; expiresAt: string } {
  const exp = Date.now() + TOKEN_TTL_MS;
  const id = randomUUID();
  issuedTokens.set(id, {
    sessionId: params.sessionId,
    userId: params.userId,
    accessToken: params.accessToken,
    exp,
  });
  const signature = sign(id);
  return {
    token: `${id}.${signature}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifyVoiceSocketToken(
  token: string | null,
): VoiceSocketTokenPayload | null {
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

  const issued = issuedTokens.get(id);
  issuedTokens.delete(id);
  if (!issued?.sessionId || !issued.userId || !issued.accessToken) return null;
  if (issued.exp < Date.now()) return null;
  return issued;
}
