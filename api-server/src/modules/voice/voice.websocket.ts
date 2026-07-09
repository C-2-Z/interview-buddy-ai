import type { Server } from "node:http";
import type { ServerType } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";
import { createUserClient } from "../../shared/db/supabase.js";
import { markTurnInterrupted } from "../questions/messages.repository.js";
import { createStreamingAsrSession } from "./qwen-asr.service.js";
import {
  qwenTtsSampleRate,
  streamSpeechWithQwen,
} from "./qwen-tts.service.js";
import {
  appendVoiceAssistantMessage,
  decideVoiceTurn,
  prepareVoiceTurn,
  streamVoiceReply,
  type PreparedVoiceTurn,
  type VoiceTurnResult,
} from "./voice-turn.service.js";
import { voiceError, voiceLog } from "./voice-logger.js";
import { verifyVoiceSocketToken } from "./voice-token.service.js";
import type {
  VoiceClientEvent,
  VoiceServerEvent,
} from "./voice.types.js";

type AudioTurnState = {
  sessionId: string;
  questionId: string;
  turnId: string;
  sampleRate: number;
  audioChunks: number;
  audioBytes: number;
  abortController: AbortController;
  asr: ReturnType<typeof createStreamingAsrSession>;
};

type SpeechSegment = {
  text: string;
  rest: string;
};

const MAX_TTS_SEGMENT_CHARS = 48;
const MIN_SENTENCE_CHARS = 8;
const VOICE_REPLY_TIMEOUT_MS = 45000;
const VOICE_DECISION_TIMEOUT_MS = 45000;
const SENTENCE_BREAKS = new Set([".", "!", "?", "\n", "\u3002", "\uFF01", "\uFF1F"]);

function sendJson(ws: WebSocket, event: VoiceServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sendStage(
  ws: WebSocket,
  stage: string,
  message: string,
  turnId?: string,
): void {
  voiceLog("stage", { stage, message, turnId });
  sendJson(ws, { type: "voice_stage", stage, message, turnId });
}

function createTurnTimeout(
  turn: AudioTurnState,
  ws: WebSocket,
  timeoutMs: number,
  message: string,
): NodeJS.Timeout {
  return setTimeout(() => {
    if (turn.abortController.signal.aborted) return;
    voiceLog("turn_timeout", {
      turnId: turn.turnId,
      questionId: turn.questionId,
      timeoutMs,
      message,
    });
    sendJson(ws, { type: "error", message });
    turn.asr.abort();
    turn.abortController.abort();
  }, timeoutMs);
}

function rawToBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(new Uint8Array(data));
}

function parseClientEvent(data: WebSocket.RawData): VoiceClientEvent | null {
  try {
    const text = typeof data === "string"
      ? data
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : Array.isArray(data)
          ? Buffer.concat(data).toString("utf8")
          : Buffer.from(new Uint8Array(data)).toString("utf8");
    const value = JSON.parse(text) as VoiceClientEvent;
    return value?.type ? value : null;
  } catch {
    return null;
  }
}

function takeNextSpeechSegment(
  buffer: string,
  final = false,
): SpeechSegment | null {
  for (let i = 0; i < buffer.length; i += 1) {
    if (i < MIN_SENTENCE_CHARS) continue;
    if (SENTENCE_BREAKS.has(buffer[i])) {
      return {
        text: buffer.slice(0, i + 1).trim(),
        rest: buffer.slice(i + 1),
      };
    }
  }

  if (buffer.length >= MAX_TTS_SEGMENT_CHARS) {
    return {
      text: buffer.slice(0, MAX_TTS_SEGMENT_CHARS).trim(),
      rest: buffer.slice(MAX_TTS_SEGMENT_CHARS),
    };
  }

  if (final && buffer.trim()) return { text: buffer.trim(), rest: "" };
  return null;
}

function sendDecisionEvents(
  ws: WebSocket,
  turn: AudioTurnState,
  result: VoiceTurnResult,
): void {
  if (result.action === "finish_question" && result.score != null) {
    sendJson(ws, {
      type: "question_scored",
      questionId: turn.questionId,
      score: result.score,
      feedback: result.feedback ?? "",
    });
    if (result.nextQuestionId) {
      sendJson(ws, {
        type: "next_question",
        questionId: result.nextQuestionId,
      });
    }
  }

  if (result.sessionCompleted) {
    sendJson(ws, {
      type: "session_completed",
      overallScore: result.sessionCompleted.overallScore,
      overallFeedback: result.sessionCompleted.overallFeedback,
    });
  }
}

export function installVoiceWebSocket(server: ServerType): void {
  const httpServer = server as unknown as Server;
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/api/voice/ws") return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", async (ws, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const tokenPayload = verifyVoiceSocketToken(url.searchParams.get("token"));
    if (!tokenPayload) {
      voiceLog("ws_reject_invalid_token");
      sendJson(ws, { type: "error", message: "Invalid or expired voice token" });
      ws.close(1008, "Invalid token");
      return;
    }
    const payload = tokenPayload;
    voiceLog("ws_connected", {
      sessionId: payload.sessionId,
      userId: payload.userId,
    });

    const supabase = createUserClient(payload.accessToken);
    const { data, error } = await supabase.auth.getClaims(payload.accessToken);
    const claims = data?.claims;
    if (error || claims?.sub !== payload.userId) {
      voiceLog("ws_reject_unauthorized", {
        sessionId: payload.sessionId,
        userId: payload.userId,
        hasError: Boolean(error),
      });
      sendJson(ws, { type: "error", message: "Unauthorized voice session" });
      ws.close(1008, "Unauthorized");
      return;
    }

    let activeTurn: AudioTurnState | null = null;
    const interruptedTurns = new Set<string>();

    function isInterrupted(turnId: string): boolean {
      return interruptedTurns.has(turnId);
    }

    async function interrupt(turnId: string) {
      voiceLog("interrupt", { turnId });
      interruptedTurns.add(turnId);
      if (activeTurn?.turnId === turnId) {
        activeTurn.asr.abort();
        activeTurn.abortController.abort();
      }
      try {
        await markTurnInterrupted(supabase, turnId);
      } catch {
        // The assistant message may not exist yet.
      }
      sendJson(ws, { type: "interrupted", turnId });
      sendJson(ws, { type: "generation_cancelled", turnId });
    }

    async function speakText(turn: AudioTurnState, text: string): Promise<void> {
      let audioStarted = false;
      let sequence = 0;

      function ensureAudioStart() {
        if (audioStarted || isInterrupted(turn.turnId)) return;
        audioStarted = true;
        sendJson(ws, {
          type: "assistant_audio_start",
          turnId: turn.turnId,
          sampleRate: qwenTtsSampleRate(),
        });
      }

      ensureAudioStart();
      sendStage(ws, "tts_streaming", "TTS: synthesizing assistant audio", turn.turnId);
      voiceLog("tts_speak_start", { turnId: turn.turnId, textLength: text.length });
      for await (const chunk of streamSpeechWithQwen({
        text,
        signal: turn.abortController.signal,
      })) {
        if (isInterrupted(turn.turnId)) return;
        sequence += 1;
        sendJson(ws, {
          type: "assistant_audio_chunk",
          turnId: turn.turnId,
          sequence,
          byteLength: chunk.length,
        });
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      }

      voiceLog("tts_speak_done", { turnId: turn.turnId, chunks: sequence });
      if (audioStarted && !isInterrupted(turn.turnId)) {
        sendJson(ws, { type: "assistant_audio_end", turnId: turn.turnId });
      }
    }

    async function processPreparedTurn(
      turn: AudioTurnState,
      prepared: PreparedVoiceTurn,
    ): Promise<void> {
      let assistantText = "";
      let ttsBuffer = "";
      let ttsChain = Promise.resolve();
      let audioStarted = false;
      let sequence = 0;

      function ensureAudioStart() {
        if (audioStarted || isInterrupted(turn.turnId)) return;
        audioStarted = true;
        sendJson(ws, {
          type: "assistant_audio_start",
          turnId: turn.turnId,
          sampleRate: qwenTtsSampleRate(),
        });
      }

      function enqueueTts(segment: string) {
        const text = segment.trim();
        if (!text) return;
        ttsChain = ttsChain.then(async () => {
          if (isInterrupted(turn.turnId)) return;
          ensureAudioStart();
          sendStage(ws, "tts_streaming", "TTS: synthesizing assistant audio", turn.turnId);
          voiceLog("tts_segment_start", { turnId: turn.turnId, textLength: text.length });
          for await (const chunk of streamSpeechWithQwen({
            text,
            signal: turn.abortController.signal,
          })) {
            if (isInterrupted(turn.turnId)) return;
            sequence += 1;
            sendJson(ws, {
              type: "assistant_audio_chunk",
              turnId: turn.turnId,
              sequence,
              byteLength: chunk.length,
            });
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          }
        });
      }

      try {
        voiceLog("reply_start", {
          turnId: turn.turnId,
          questionId: turn.questionId,
          kind: prepared.kind,
        });
        const replyTimeout = createTurnTimeout(
          turn,
          ws,
          VOICE_REPLY_TIMEOUT_MS,
          "LLM timeout while generating interviewer response",
        );
        sendStage(ws, "llm_streaming", "LLM: generating interviewer response", turn.turnId);

        if (prepared.kind === "redirect") {
          clearTimeout(replyTimeout);
          assistantText = prepared.response;
          sendJson(ws, {
            type: "assistant_text_delta",
            text: assistantText,
            turnId: turn.turnId,
          });
          sendJson(ws, { type: "assistant_text_done", turnId: turn.turnId });
          await appendVoiceAssistantMessage({ turn: prepared, content: assistantText });
          await speakText(turn, assistantText);
          const result = await decideVoiceTurn(prepared, assistantText);
          if (!isInterrupted(turn.turnId)) sendDecisionEvents(ws, turn, result);
          return;
        }

        try {
          for await (const delta of streamVoiceReply(
            prepared,
            turn.abortController.signal,
          )) {
            if (isInterrupted(turn.turnId)) return;
            assistantText += delta;
            ttsBuffer += delta;
            sendJson(ws, {
              type: "assistant_text_delta",
              text: delta,
              turnId: turn.turnId,
            });

            while (true) {
              const nextSegment = takeNextSpeechSegment(ttsBuffer);
              if (!nextSegment) break;
              ttsBuffer = nextSegment.rest;
              enqueueTts(nextSegment.text);
            }
          }
        } finally {
          clearTimeout(replyTimeout);
        }

        voiceLog("reply_text_done", {
          turnId: turn.turnId,
          textLength: assistantText.length,
        });
        const finalSegment = takeNextSpeechSegment(ttsBuffer, true);
        if (finalSegment) enqueueTts(finalSegment.text);
        assistantText = assistantText.trim();
        if (!assistantText) {
          assistantText = "Please continue with your answer.";
          sendJson(ws, {
            type: "assistant_text_delta",
            text: assistantText,
            turnId: turn.turnId,
          });
          enqueueTts(assistantText);
        }

        if (!isInterrupted(turn.turnId)) {
          sendJson(ws, { type: "assistant_text_done", turnId: turn.turnId });
          await appendVoiceAssistantMessage({ turn: prepared, content: assistantText });
        }

        const decisionController = new AbortController();
        const decisionTimeout = setTimeout(() => {
          decisionController.abort();
        }, VOICE_DECISION_TIMEOUT_MS);
        voiceLog("decision_start", { turnId: turn.turnId });
        const decisionPromise: Promise<VoiceTurnResult | Error> = Promise.race([
          decideVoiceTurn(prepared, assistantText),
          new Promise<VoiceTurnResult>((_, reject) => {
            decisionController.signal.addEventListener(
              "abort",
              () => reject(new Error("Decision timeout")),
              { once: true },
            );
          }),
        ]).catch((decisionError: unknown) =>
          decisionError instanceof Error ? decisionError : new Error(String(decisionError)),
        ).finally(() => clearTimeout(decisionTimeout));

        await ttsChain;
        if (audioStarted && !isInterrupted(turn.turnId)) {
          sendJson(ws, { type: "assistant_audio_end", turnId: turn.turnId });
        }

        sendStage(ws, "deciding", "LLM: deciding score or next question", turn.turnId);
        const result = await decisionPromise;
        if (result instanceof Error) throw result;
        voiceLog("decision_done", {
          turnId: turn.turnId,
          action: result.action,
          hasScore: result.score != null,
          nextQuestionId: result.nextQuestionId,
        });
        if (!isInterrupted(turn.turnId)) sendDecisionEvents(ws, turn, result);
        if (!isInterrupted(turn.turnId)) {
          sendStage(ws, "done", "Voice turn completed", turn.turnId);
        }
      } catch (processError) {
        voiceError("reply_failed", processError, {
          turnId: turn.turnId,
          questionId: turn.questionId,
        });
        if (isInterrupted(turn.turnId) || turn.abortController.signal.aborted) {
          if (assistantText.trim()) {
            await appendVoiceAssistantMessage({
              turn: prepared,
              content: assistantText,
              interrupted: true,
            });
          }
          return;
        }
        throw processError;
      }
    }

    async function processTranscript(
      turn: AudioTurnState,
      transcript: string,
      confidence: number | null,
    ): Promise<void> {
      if (isInterrupted(turn.turnId)) return;
      if (!transcript.trim()) {
        voiceLog("transcript_empty", {
          turnId: turn.turnId,
          audioChunks: turn.audioChunks,
          audioBytes: turn.audioBytes,
        });
        sendJson(ws, { type: "error", message: "No valid speech was recognized" });
        return;
      }

      voiceLog("transcript_final", {
        turnId: turn.turnId,
        textLength: transcript.length,
        confidence,
      });
      sendStage(ws, "asr_final", "ASR: final transcript received", turn.turnId);
      sendJson(ws, {
        type: "transcript_final",
        text: transcript,
        turnId: turn.turnId,
      });

      sendStage(ws, "loading_context", "DB: loading question and history", turn.turnId);
      voiceLog("prepare_turn_start", {
        turnId: turn.turnId,
        questionId: turn.questionId,
      });
      const prepared = await prepareVoiceTurn({
        supabase,
        userId: payload.userId,
        sessionId: turn.sessionId,
        questionId: turn.questionId,
        turnId: turn.turnId,
        transcript,
        confidence,
      });
      if (isInterrupted(turn.turnId)) return;
      voiceLog("prepare_turn_done", { turnId: turn.turnId, kind: prepared.kind });
      await processPreparedTurn(turn, prepared);
    }

    async function consumeAsrEvents(turn: AudioTurnState) {
      let finalized = false;
      try {
        for await (const event of turn.asr.events) {
          if (isInterrupted(turn.turnId)) return;
          if (event.type === "debug") {
            voiceLog("asr_debug", { turnId: turn.turnId, message: event.text });
            sendStage(ws, "asr_debug", event.text, turn.turnId);
            continue;
          }
          if (event.type === "partial") {
            voiceLog("asr_partial", {
              turnId: turn.turnId,
              textLength: event.text.length,
            });
            sendStage(ws, "asr_streaming", "ASR: partial transcript received", turn.turnId);
            sendJson(ws, {
              type: "transcript_partial",
              text: event.text,
              turnId: turn.turnId,
            });
            continue;
          }

          finalized = true;
          await processTranscript(turn, event.text, event.confidence);
          return;
        }

        if (!finalized && !isInterrupted(turn.turnId)) {
          voiceLog("asr_no_final", {
            turnId: turn.turnId,
            audioChunks: turn.audioChunks,
            audioBytes: turn.audioBytes,
          });
          sendJson(ws, { type: "error", message: "No valid speech was recognized" });
        }
      } catch (asrError) {
        voiceError("asr_failed", asrError, {
          turnId: turn.turnId,
          audioChunks: turn.audioChunks,
          audioBytes: turn.audioBytes,
        });
        if (isInterrupted(turn.turnId) || turn.abortController.signal.aborted) return;
        sendJson(ws, {
          type: "error",
          message: asrError instanceof Error ? asrError.message : "Voice turn failed",
        });
      } finally {
        if (activeTurn?.turnId === turn.turnId) activeTurn = null;
      }
    }

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        if (!activeTurn) return;
        const chunk = rawToBuffer(data);
        activeTurn.audioChunks += 1;
        activeTurn.audioBytes += chunk.length;
        if (activeTurn.audioChunks === 1 || activeTurn.audioChunks % 20 === 0) {
          voiceLog("ws_audio_received", {
            turnId: activeTurn.turnId,
            chunks: activeTurn.audioChunks,
            bytes: activeTurn.audioBytes,
          });
          sendStage(
            ws,
            "audio_receiving",
            `WS: received ${activeTurn.audioChunks} audio chunks, ${activeTurn.audioBytes} bytes`,
            activeTurn.turnId,
          );
        }
        activeTurn.asr.sendAudio(chunk);
        return;
      }

      const event = parseClientEvent(data);
      if (!event) return;

      if (event.type === "audio_start") {
        voiceLog("ws_audio_start", {
          sessionId: event.sessionId,
          questionId: event.questionId,
          turnId: event.turnId,
          sampleRate: event.sampleRate,
        });
        if (event.sessionId !== payload.sessionId) {
          sendJson(ws, { type: "error", message: "Session mismatch" });
          return;
        }
        if (activeTurn) {
          activeTurn.asr.abort();
          activeTurn.abortController.abort();
        }
        const abortController = new AbortController();
        activeTurn = {
          sessionId: event.sessionId,
          questionId: event.questionId,
          turnId: event.turnId,
          sampleRate: event.sampleRate,
          audioChunks: 0,
          audioBytes: 0,
          abortController,
          asr: createStreamingAsrSession({
            sampleRate: event.sampleRate,
            signal: abortController.signal,
          }),
        };
        sendStage(ws, "listening", "WS: receiving microphone audio", event.turnId);
        void consumeAsrEvents(activeTurn);
        return;
      }

      if (event.type === "audio_end") {
        if (!activeTurn || activeTurn.turnId !== event.turnId) return;
        voiceLog("ws_audio_end", {
          turnId: event.turnId,
          chunks: activeTurn.audioChunks,
          bytes: activeTurn.audioBytes,
        });
        sendStage(
          ws,
          "audio_submitting",
          `WS: submitting ${activeTurn.audioChunks} chunks, ${activeTurn.audioBytes} bytes to ASR`,
          event.turnId,
        );
        activeTurn.asr.finish();
        return;
      }

      if (event.type === "interrupt") {
        void interrupt(event.turnId);
      }
    });

    ws.on("close", () => {
      voiceLog("ws_closed", {
        sessionId: payload.sessionId,
        activeTurnId: activeTurn?.turnId,
      });
      activeTurn?.asr.abort();
      activeTurn?.abortController.abort();
    });

    sendJson(ws, { type: "ready", sessionId: payload.sessionId });
    voiceLog("ws_ready_sent", { sessionId: payload.sessionId });
  });
}
