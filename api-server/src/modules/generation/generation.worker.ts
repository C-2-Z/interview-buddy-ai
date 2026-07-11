import "../../preload.js";
import { Worker } from "bullmq";
import { bullMqConnection, GENERATION_QUEUE } from "./generation.queue.js";
import {
  dispatchPendingGenerationJobs,
  processGenerationJob,
  processReportJob,
} from "./generation.service.js";
import { createServiceClient } from "../../shared/db/supabase.js";
import { completeOutboxForSession } from "./generation.repository.js";
import { createModuleLogger } from "../voice/voice-logger.js";

const concurrency = Math.max(1, Number(process.env.QUESTION_WORKER_CONCURRENCY || "4"));
const logger = createModuleLogger("generation-worker");

const worker = new Worker(
  GENERATION_QUEUE,
  async (job) => {
    const sessionId = String(job.data.sessionId ?? "");
    if (!sessionId) throw new Error("Generation job is missing sessionId");
    if (job.name === "generate-report") await processReportJob(sessionId);
    else await processGenerationJob(sessionId);
  },
  { connection: bullMqConnection(), concurrency },
);

worker.on("failed", (job, error) => {
  logger.error(error, { jobId: job?.id, event: "job_failed" });
  if (job?.name === "generate-questions" && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void completeOutboxForSession(
      createServiceClient(),
      String(job.data.sessionId),
      "failed",
      error.message,
    );
  }
});
worker.on("completed", (job) => {
  if (job.name === "generate-questions") {
    void completeOutboxForSession(createServiceClient(), String(job.data.sessionId), "completed");
  }
});

await dispatchPendingGenerationJobs();
setInterval(() => void dispatchPendingGenerationJobs().catch(() => undefined), 2_000);
logger.success("worker_ready", { concurrency });
