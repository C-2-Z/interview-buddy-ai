export type GenerationStatus = "queued" | "generating" | "ready" | "failed";

export type GenerationSnapshot = {
  sessionId: string;
  status: GenerationStatus;
  generatedCount: number;
  requestedCount: number;
  error: string | null;
  version: number;
};

export type GenerationEvent = GenerationSnapshot & {
  type: "snapshot" | "question_ready" | "progress" | "ready" | "failed" | "report_ready";
  orderIndex?: number;
};
