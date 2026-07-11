import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { GenerationRetrySchema } from "./generation.schemas.js";
import { createGenerationSubscriber, generationChannel, progressiveGenerationEnabled } from "./generation.queue.js";
import { generationSnapshot, retryGeneration } from "./generation.service.js";

const generation = new Hono<{ Variables: AuthVariables }>();
generation.use("*", requireAuth);

generation.get("/:sessionId/generation", async (c) => {
  return c.json(await generationSnapshot(c.var.supabase, c.req.param("sessionId")));
});

generation.post("/:sessionId/generation/retry", async (c) => {
  GenerationRetrySchema.parse(await c.req.json().catch(() => ({})));
  return c.json(await retryGeneration(c.var.supabase, c.req.param("sessionId")), 202);
});

generation.get("/:sessionId/generation/events", async (c) => {
  const sessionId = c.req.param("sessionId");
  const initial = await generationSnapshot(c.var.supabase, sessionId);
  if (!progressiveGenerationEnabled()) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: "snapshot", data: JSON.stringify({ type: "snapshot", ...initial }) });
    });
  }
  return streamSSE(c, async (stream) => {
    const subscriber = createGenerationSubscriber();
    const channel = generationChannel(sessionId);
    await stream.writeSSE({ event: "snapshot", data: JSON.stringify({ type: "snapshot", ...initial }) });
    await subscriber.subscribe(channel);
    const keepAlive = setInterval(() => void stream.writeSSE({ event: "ping", data: "{}" }).catch(() => undefined), 15_000);
    try {
      await new Promise<void>((resolve) => {
        subscriber.on("message", (_channel, payload) => {
          void stream.writeSSE({ data: payload }).catch(() => resolve());
        });
        subscriber.once("error", () => resolve());
        stream.onAbort(resolve);
      });
    } finally {
      clearInterval(keepAlive);
      await subscriber.unsubscribe(channel).catch(() => undefined);
      subscriber.disconnect();
    }
  });
});

export { generation };
