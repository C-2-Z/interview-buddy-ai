import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { getRequiredEnv } from "../../config/env.js";
import { voiceError, voiceLog } from "../../shared/logger/voice-logger.js";

type QwenRealtimeResult = {
  text: string;
  audio: Buffer;
};

export type QwenAsrStreamEvent = {
  type: "partial" | "final" | "debug";
  text: string;
  confidence: number | null;
};

export type QwenAsrSession = {
  events: AsyncIterable<QwenAsrStreamEvent>;
  sendAudio: (chunk: Buffer) => void;
  finish: () => void;
  abort: () => void;
};

export type QwenTtsSession = {
  readonly closed: boolean;
  speak: (text: string, signal?: AbortSignal) => AsyncIterable<Buffer>;
  close: () => void;
};

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private closed = false;
  private failure: Error | null = null;

  push(item: T): void {
    if (this.closed || this.failure) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: item, done: false });
      return;
    }
    this.items.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) return Promise.resolve({ value: item, done: false });
        if (this.failure) return Promise.reject(this.failure);
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }
}

function qwenHeaders() {
  return {
    Authorization: `Bearer ${getRequiredEnv("AI_BAILIAN_API_KEY")}`,
    "OpenAI-Beta": "realtime=v1",
  };
}

function qwenRealtimeUrl(kind: "asr" | "tts", model: string): string {
  const envName = kind === "asr" ? "QWEN_ASR_URL" : "QWEN_TTS_URL";
  const rawUrl = process.env[envName]?.trim();
  if (!rawUrl) {
    throw new Error(
      `${envName} is required. Use a Qwen realtime endpoint such as wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime`,
    );
  }
  if (rawUrl.includes("{WorkspaceId}")) {
    throw new Error(`${envName} still contains {WorkspaceId}. Replace it with the real workspace id.`);
  }

  const url = new URL(rawUrl);
  url.searchParams.set("model", model);
  return url.toString();
}

function parseJsonMessage(data: WebSocket.RawData): Record<string, unknown> | null {
  if (typeof data !== "string" && !Buffer.isBuffer(data)) return null;
  try {
    return JSON.parse(data.toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, value: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(value));
  }
}

function eventId(): string {
  return `event_${randomUUID()}`;
}

function extractQwenError(payload: Record<string, unknown>): Error | null {
  if (payload.type !== "error") return null;
  const error = payload.error as Record<string, unknown> | undefined;
  const code = String(error?.code ?? payload.code ?? "QwenRealtimeError");
  const message = String(error?.message ?? payload.message ?? "Qwen realtime request failed");
  return new Error(`${code}: ${message}`);
}

function extractAsrPartialText(payload: Record<string, unknown>): string {
  const text = typeof payload.text === "string" ? payload.text : "";
  const stash = typeof payload.stash === "string" ? payload.stash : "";
  return `${text}${stash}`.trim();
}

function extractAsrFinalText(payload: Record<string, unknown>): string {
  return typeof payload.transcript === "string" ? payload.transcript.trim() : "";
}

function qwenEventType(payload: Record<string, unknown>): string {
  return typeof payload.type === "string" ? payload.type : "";
}

function sendAsrSessionUpdate(ws: WebSocket, sampleRate: number): void {
  sendJson(ws, {
    event_id: eventId(),
    type: "session.update",
    session: {
      modalities: ["text"],
      input_audio_format: "pcm",
      sample_rate: sampleRate,
      input_audio_transcription: {
        language: "zh",
      },
      turn_detection: null,
    },
  });
}

function sendTtsSessionUpdate(ws: WebSocket, params: {
  voice?: string;
  sampleRate: number;
}): void {
  sendJson(ws, {
    event_id: eventId(),
    type: "session.update",
    session: {
      mode: "commit",
      voice: params.voice,
      response_format: "pcm",
      sample_rate: params.sampleRate,
      language_type: "Auto",
    },
  });
}

export function createQwenAsrSession(params: {
  model: string;
  sampleRate: number;
  signal?: AbortSignal;
}): QwenAsrSession {
  const queue = new AsyncQueue<QwenAsrStreamEvent>();
  const logId = randomUUID();

  if (process.env.VOICE_MOCK_QWEN === "1") {
    let sentPartial = false;
    let done = false;
    voiceLog("qwen_asr_mock_session", { logId });
    return {
      events: queue,
      sendAudio: () => {
        if (!sentPartial && !done) {
          sentPartial = true;
          queue.push({
            type: "partial",
            text: "This is a mock streaming transcript.",
            confidence: null,
          });
        }
      },
      finish: () => {
        if (done) return;
        done = true;
        queue.push({
          type: "final",
          text: "This is a mock streaming transcript.",
          confidence: null,
        });
        queue.close();
      },
      abort: () => {
        done = true;
        queue.close();
      },
    };
  }

  const url = qwenRealtimeUrl("asr", params.model);
  voiceLog("qwen_asr_connecting", {
    logId,
    model: params.model,
    sampleRate: params.sampleRate,
    urlHost: new URL(url).host,
  });
  const ws = new WebSocket(url, { headers: qwenHeaders() });
  const pendingChunks: Buffer[] = [];
  let opened = false;
  let ready = false;
  let finishRequested = false;
  let finishSent = false;
  let settled = false;
  let latestText = "";
  let finishTimer: NodeJS.Timeout | null = null;
  let sentChunks = 0;
  let sentBytes = 0;

  function cleanup() {
    params.signal?.removeEventListener("abort", abort);
    if (finishTimer) clearTimeout(finishTimer);
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }

  function finishWithText(text: string) {
    if (settled) return;
    settled = true;
    const finalText = text.trim();
    voiceLog("qwen_asr_finished", {
      logId,
      hasText: Boolean(finalText),
      textLength: finalText.length,
      sentChunks,
      sentBytes,
    });
    if (finalText) {
      queue.push({ type: "final", text: finalText, confidence: null });
    } else if (finishRequested) {
      queue.fail(new Error("没有识别到有效语音，请确认麦克风权限和输入音量后重试"));
      cleanup();
      return;
    }
    queue.close();
    cleanup();
  }

  function fail(error: Error) {
    if (settled) return;
    settled = true;
    voiceError("qwen_asr_failed", error, { logId, sentChunks, sentBytes });
    queue.fail(error);
    cleanup();
  }

  function abort() {
    if (settled) return;
    settled = true;
    voiceLog("qwen_asr_aborted", { logId, sentChunks, sentBytes });
    queue.close();
    cleanup();
  }

  function markAudioSent(chunk: Buffer) {
    sentChunks += 1;
    sentBytes += chunk.length;
    if (sentChunks === 1 || sentChunks % 20 === 0) {
      voiceLog("qwen_asr_audio_sent", { logId, sentChunks, sentBytes });
    }
  }

  function sendAudioChunk(chunk: Buffer) {
    markAudioSent(chunk);
    sendJson(ws, {
      event_id: eventId(),
      type: "input_audio_buffer.append",
      audio: chunk.toString("base64"),
    });
  }

  function sendFinish() {
    if (!opened || !ready || finishSent || settled) return;
    finishSent = true;
    voiceLog("qwen_asr_commit", { logId, sentChunks, sentBytes });
    sendJson(ws, { event_id: eventId(), type: "input_audio_buffer.commit" });
    queue.push({
      type: "debug",
      text: "音频已提交给 Qwen ASR，等待最终转写",
      confidence: null,
    });
    finishTimer = setTimeout(() => {
      voiceLog("qwen_asr_timeout", {
        logId,
        latestTextLength: latestText.length,
        sentChunks,
        sentBytes,
      });
      queue.push({
        type: "debug",
        text: latestText
          ? "Qwen ASR 未返回最终事件，使用最后一次实时转写"
          : "Qwen ASR 等待超时，未返回有效转写",
        confidence: null,
      });
      finishWithText(latestText);
    }, 15000);
  }

  function flushAudio() {
    if (!opened || !ready || settled) return;
    for (const chunk of pendingChunks.splice(0)) sendAudioChunk(chunk);
    if (finishRequested) sendFinish();
  }

  params.signal?.addEventListener("abort", abort, { once: true });

  ws.on("open", () => {
    opened = true;
    voiceLog("qwen_asr_open", { logId });
    sendAsrSessionUpdate(ws, params.sampleRate);
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const payload = parseJsonMessage(data);
    if (!payload) return;

    const failure = extractQwenError(payload);
    if (failure) {
      fail(failure);
      return;
    }

    const eventType = qwenEventType(payload);
    if (eventType) {
      voiceLog("qwen_asr_event", {
        logId,
        eventType,
        hasText: Boolean(extractAsrPartialText(payload) || extractAsrFinalText(payload)),
      });
    }

    if (
      eventType === "session.created" ||
      eventType === "session.updated" ||
      eventType === "input_audio_buffer.committed" ||
      eventType === "input_audio_buffer.speech_started" ||
      eventType === "input_audio_buffer.speech_stopped"
    ) {
      queue.push({
        type: "debug",
        text: `Qwen ASR 事件：${eventType}`,
        confidence: null,
      });
    }

    if (payload.type === "session.updated") {
      ready = true;
      flushAudio();
      return;
    }

    if (payload.type === "conversation.item.input_audio_transcription.text") {
      const text = extractAsrPartialText(payload);
      if (text && text !== latestText) {
        latestText = text;
        queue.push({ type: "partial", text, confidence: null });
      }
      return;
    }

    if (payload.type === "conversation.item.input_audio_transcription.completed") {
      const text = extractAsrFinalText(payload) || latestText;
      finishWithText(text);
      return;
    }

    if (payload.type === "session.finished") {
      finishWithText(latestText);
    }
  });

  ws.on("error", (error) => fail(error));
  ws.on("close", (code, reason) => {
    voiceLog("qwen_asr_close", {
      logId,
      code,
      reason: reason.toString(),
      settled,
      sentChunks,
      sentBytes,
    });
    if (settled) return;
    const closeReason = reason.toString();
    if (closeReason) {
      fail(new Error(closeReason));
      return;
    }
    finishWithText(latestText);
  });

  return {
    events: queue,
    sendAudio: (chunk) => {
      if (settled) return;
      if (opened && ready && ws.readyState === WebSocket.OPEN) {
        sendAudioChunk(chunk);
        return;
      }
      pendingChunks.push(chunk);
    },
    finish: () => {
      if (settled) return;
      finishRequested = true;
      voiceLog("qwen_asr_finish_requested", {
        logId,
        opened,
        ready,
        pendingChunks: pendingChunks.length,
        sentChunks,
        sentBytes,
      });
      sendFinish();
    },
    abort,
  };
}

export async function* streamQwenTtsAudio(params: {
  model: string;
  inputText: string;
  sampleRate: number;
  voice?: string;
  signal?: AbortSignal;
}): AsyncIterable<Buffer> {
  const logId = randomUUID();
  if (process.env.VOICE_MOCK_QWEN === "1") {
    voiceLog("qwen_tts_mock_session", { logId });
    yield Buffer.alloc(Math.max(4800, Math.round(params.sampleRate * 0.2) * 2));
    return;
  }

  const queue = new AsyncQueue<Buffer>();
  const url = qwenRealtimeUrl("tts", params.model);
  voiceLog("qwen_tts_connecting", {
    logId,
    model: params.model,
    sampleRate: params.sampleRate,
    voice: params.voice,
    textLength: params.inputText.length,
    urlHost: new URL(url).host,
  });
  const ws = new WebSocket(url, { headers: qwenHeaders() });
  let settled = false;
  let ready = false;
  let textSent = false;
  let audioChunks = 0;
  let audioBytes = 0;

  function cleanup() {
    params.signal?.removeEventListener("abort", abort);
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }

  function close() {
    if (settled) return;
    settled = true;
    voiceLog("qwen_tts_finished", { logId, audioChunks, audioBytes });
    queue.close();
    cleanup();
  }

  function fail(error: Error) {
    if (settled) return;
    settled = true;
    voiceError("qwen_tts_failed", error, { logId, audioChunks, audioBytes });
    queue.fail(error);
    cleanup();
  }

  function abort() {
    if (settled) return;
    settled = true;
    voiceLog("qwen_tts_aborted", { logId, audioChunks, audioBytes });
    queue.close();
    cleanup();
  }

  function sendText() {
    if (!ready || textSent || settled) return;
    textSent = true;
    voiceLog("qwen_tts_commit_text", { logId, textLength: params.inputText.length });
    sendJson(ws, {
      event_id: eventId(),
      type: "input_text_buffer.append",
      text: params.inputText,
    });
    sendJson(ws, { event_id: eventId(), type: "input_text_buffer.commit" });
  }

  params.signal?.addEventListener("abort", abort, { once: true });

  ws.on("open", () => {
    voiceLog("qwen_tts_open", { logId });
    sendTtsSessionUpdate(ws, {
      voice: params.voice,
      sampleRate: params.sampleRate,
    });
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const payload = parseJsonMessage(data);
    if (!payload) return;

    const failure = extractQwenError(payload);
    if (failure) {
      fail(failure);
      return;
    }

    const eventType = qwenEventType(payload);
    if (eventType && eventType !== "response.audio.delta") {
      voiceLog("qwen_tts_event", { logId, eventType });
    }

    if (payload.type === "session.updated") {
      ready = true;
      sendText();
      return;
    }

    if (payload.type === "response.audio.delta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) {
        const chunk = Buffer.from(delta, "base64");
        audioChunks += 1;
        audioBytes += chunk.length;
        if (audioChunks === 1 || audioChunks % 20 === 0) {
          voiceLog("qwen_tts_audio_received", { logId, audioChunks, audioBytes });
        }
        queue.push(chunk);
      }
      return;
    }

    if (payload.type === "response.done") {
      sendJson(ws, { event_id: eventId(), type: "session.finish" });
      return;
    }

    if (payload.type === "session.finished") {
      close();
    }
  });

  ws.on("error", (error) => fail(error));
  ws.on("close", (code, reason) => {
    voiceLog("qwen_tts_close", {
      logId,
      code,
      reason: reason.toString(),
      settled,
      audioChunks,
      audioBytes,
    });
    if (settled) return;
    const closeReason = reason.toString();
    if (closeReason) {
      fail(new Error(closeReason));
      return;
    }
    close();
  });

  try {
    for await (const chunk of queue) {
      yield chunk;
    }
  } finally {
    cleanup();
  }
}

export function createQwenTtsSession(params: {
  model: string;
  sampleRate: number;
  voice?: string;
}): QwenTtsSession {
  if (process.env.VOICE_MOCK_QWEN === "1") {
    let closed = false;
    return {
      get closed() { return closed; },
      async *speak() { yield Buffer.alloc(Math.round(params.sampleRate * 0.2) * 2); },
      close() { closed = true; },
    };
  }

  const url = qwenRealtimeUrl("tts", params.model);
  const ws = new WebSocket(url, { headers: qwenHeaders() });
  let ready = false;
  let closed = false;
  let active: AsyncQueue<Buffer> | null = null;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: Error) => void) | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  function close(error?: Error) {
    if (closed) return;
    closed = true;
    if (error) active?.fail(error); else active?.close();
    active = null;
    if (!ready) readyReject?.(error ?? new Error("Qwen TTS connection closed before ready"));
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
  }

  ws.on("open", () => sendTtsSessionUpdate(ws, {
    voice: params.voice,
    sampleRate: params.sampleRate,
  }));
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const payload = parseJsonMessage(data);
    if (!payload) return;
    const failure = extractQwenError(payload);
    if (failure) return close(failure);
    if (payload.type === "session.updated") {
      ready = true;
      readyResolve?.();
      return;
    }
    if (payload.type === "response.audio.delta") {
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) active?.push(Buffer.from(delta, "base64"));
      return;
    }
    if (payload.type === "response.done") {
      active?.close();
      active = null;
      return;
    }
    if (payload.type === "session.finished") close();
  });
  ws.on("error", (error) => close(error));
  ws.on("close", () => close());

  return {
    get closed() { return closed; },
    async *speak(text: string, signal?: AbortSignal) {
      await readyPromise;
      if (closed) throw new Error("Qwen TTS session is closed");
      if (active) throw new Error("Qwen TTS session already has an active response");
      const queue = new AsyncQueue<Buffer>();
      active = queue;
      const abort = () => close();
      signal?.addEventListener("abort", abort, { once: true });
      sendJson(ws, { event_id: eventId(), type: "input_text_buffer.append", text });
      sendJson(ws, { event_id: eventId(), type: "input_text_buffer.commit" });
      try {
        for await (const chunk of queue) yield chunk;
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    },
    close,
  };
}

export async function runQwenRealtimeTask(params: {
  kind: "asr" | "tts";
  model: string;
  inputText?: string;
  audioChunks?: Buffer[];
  sampleRate: number;
  voice?: string;
  signal?: AbortSignal;
}): Promise<QwenRealtimeResult> {
  if (params.kind === "asr") {
    const session = createQwenAsrSession({
      model: params.model,
      sampleRate: params.sampleRate,
      signal: params.signal,
    });
    for (const chunk of params.audioChunks ?? []) session.sendAudio(chunk);
    session.finish();
    let text = "";
    for await (const event of session.events) {
      if (event.type === "final" || event.type === "partial") text = event.text;
    }
    return { text, audio: Buffer.alloc(0) };
  }

  const audioBuffers: Buffer[] = [];
  for await (const chunk of streamQwenTtsAudio({
    model: params.model,
    inputText: params.inputText ?? "",
    sampleRate: params.sampleRate,
    voice: params.voice,
    signal: params.signal,
  })) {
    audioBuffers.push(chunk);
  }
  return { text: "", audio: Buffer.concat(audioBuffers) };
}
