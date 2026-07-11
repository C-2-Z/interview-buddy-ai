import type { CreateSessionInput } from "../sessions/session.types.js";

export type GenerationStatus = "queued" | "generating" | "ready" | "failed";

export type GenerationSnapshot = {
  sessionId: string;
  status: GenerationStatus;
  generatedCount: number;
  requestedCount: number;
  error: string | null;
  version: number;
};

export type GenerationEvent =
  | ({ type: "snapshot" | "progress" | "ready" | "failed" } & GenerationSnapshot)
  | ({ type: "question_ready"; orderIndex: number } & GenerationSnapshot)
  | ({ type: "report_ready" } & GenerationSnapshot);

export type QueuedSessionInput = CreateSessionInput & { interviewMode: "text" | "voice" };
