import { apiRequest } from "@/shared/api/http-client";
import { getAccessToken } from "@/shared/api/auth-token";
import type { GenerationEvent, GenerationSnapshot } from "./types";

const baseUrl = import.meta.env.VITE_API_URL || "";

export function getGenerationStatus(sessionId: string): Promise<GenerationSnapshot> {
  return apiRequest("GET", `/api/sessions/${sessionId}/generation`);
}

export function retryGeneration(sessionId: string): Promise<GenerationSnapshot> {
  return apiRequest("POST", `/api/sessions/${sessionId}/generation/retry`, {});
}

export async function subscribeGeneration(
  sessionId: string,
  onEvent: (event: GenerationEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/generation/events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`生成进度连接失败 (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "{}") continue;
      try {
        onEvent(JSON.parse(data) as GenerationEvent);
      } catch {
        /* Ignore malformed frames. */
      }
    }
  }
}
