import IORedis from "ioredis";
import { Queue } from "bullmq";
import type { GenerationEvent } from "./generation.types.js";

export const GENERATION_QUEUE = "interview-generation";
const CHANNEL_PREFIX = "generation:";

let connection: IORedis | null = null;
let queue: Queue | null = null;

export function progressiveGenerationEnabled(): boolean {
  return process.env.PROGRESSIVE_GENERATION_ENABLED !== "0" && Boolean(process.env.REDIS_URL);
}

export function redisConnection(): IORedis {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  connection ??= new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  return connection;
}

export function bullMqConnection() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  const url = new URL(process.env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function generationQueue(): Queue {
  queue ??= new Queue(GENERATION_QUEUE, {
    connection: bullMqConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 7 * 86_400 },
    },
  });
  return queue;
}

export async function enqueueGeneration(sessionId: string): Promise<void> {
  const target = generationQueue();
  const jobId = `session-${sessionId}`;
  const existing = await target.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "failed" || state === "completed") await existing.remove();
    else return;
  }
  await target.add(
    "generate-questions",
    { sessionId },
    { jobId },
  );
}

export async function enqueueReport(sessionId: string): Promise<void> {
  await generationQueue().add(
    "generate-report",
    { sessionId },
    { jobId: `report-${sessionId}` },
  );
}

export async function publishGenerationEvent(event: GenerationEvent): Promise<void> {
  await redisConnection().publish(`${CHANNEL_PREFIX}${event.sessionId}`, JSON.stringify(event));
}

export function generationChannel(sessionId: string): string {
  return `${CHANNEL_PREFIX}${sessionId}`;
}

export function createGenerationSubscriber(): IORedis {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not configured");
  return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
}
