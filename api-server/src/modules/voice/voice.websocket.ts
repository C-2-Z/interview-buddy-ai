import type { Server } from "node:http";
import type { ServerType } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";
import { createUserClient } from "../../shared/db/supabase.js";
import { listQuestionMessages, markTurnInterrupted } from "../questions/messages.repository.js";
import { createStreamingAsrSession } from "./qwen-asr.service.js";
import {
  qwenTtsSampleRate,
  createReusableSpeechSession,
  streamSpeechWithQwen,
} from "./qwen-tts.service.js";
import {
    appendVoiceAssistantMessage,
    applyVoiceDecision,
    decideVoiceTurn,
    prepareVoiceTurn,
    streamCombinedVoiceTurn,
    streamVoiceReply,
  type PreparedVoiceTurn,
  type VoiceTurnResult,
} from "./voice-turn.service.js";
import { voiceError, voiceLog } from "./voice-logger.js";
import {
  assertVoiceSessionAccess,
  listSessionQuestions,
  type VoiceSessionQuestion,
} from "./voice.repository.js";
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

type PendingAudioStart = {
  turnId: string;
  chunks: Buffer[];
  bytes: number;
  finishRequested: boolean;
};

type SpeechTurnState = {
  turnId: string;
  abortController: AbortController;
};

type SpeechSegment = {
  text: string;
  rest: string;
};

type VoiceErrorOptions = {
  code: string;
  stage: string;
  message: string;
  turnId?: string;
  retryable?: boolean;
  detail?: string;
  error?: unknown;
  meta?: Record<string, unknown>;
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

function errorDetail(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (error == null) return undefined;
  return String(error);
}

function sendVoiceError(ws: WebSocket, options: VoiceErrorOptions): void {
  const meta = {
    code: options.code,
    stage: options.stage,
    turnId: options.turnId,
    retryable: options.retryable ?? true,
    detail: options.detail ?? errorDetail(options.error),
    ...options.meta,
  };
  if (options.error) {
    voiceError("ws_error_sent", options.error, meta);
  } else {
    voiceLog("ws_error_sent", meta);
  }
  sendJson(ws, {
    type: "error",
    message: options.message,
    code: options.code,
    stage: options.stage,
    turnId: options.turnId,
    retryable: options.retryable ?? true,
    detail: options.detail ?? errorDetail(options.error),
  });
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
    sendVoiceError(ws, {
      code: "VOICE_TURN_TIMEOUT",
      stage: "timeout",
      message,
      turnId: turn.turnId,
      retryable: true,
      meta: { questionId: turn.questionId, timeoutMs },
    });
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
      sendVoiceError(ws, {
        code: "VOICE_TOKEN_INVALID",
        stage: "auth",
        message: "语音连接已过期，请重新进入语音面试",
        retryable: false,
      });
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
      sendVoiceError(ws, {
        code: "VOICE_UNAUTHORIZED",
        stage: "auth",
        message: "语音面试认证失败，请重新登录后再试",
        retryable: false,
        meta: { sessionId: payload.sessionId, userId: payload.userId },
      });
      ws.close(1008, "Unauthorized");
      return;
    }

    try {
      await assertVoiceSessionAccess(supabase, payload.sessionId);
    } catch (accessError) {
      voiceLog("ws_reject_non_voice_session", {
        sessionId: payload.sessionId,
        error: accessError instanceof Error ? accessError.message : String(accessError),
      });
      sendVoiceError(ws, {
        code: "VOICE_SESSION_MODE_MISMATCH",
        stage: "session",
        message: "当前会话不是语音面试，请从语音面试入口进入",
        retryable: false,
        error: accessError,
        meta: { sessionId: payload.sessionId },
      });
      ws.close(1008, "Not a voice session");
      return;
    }

    let activeTurn: AudioTurnState | null = null;
    let pendingAudioStart: PendingAudioStart | null = null;
    let activePromptTurn: SpeechTurnState | null = null;
    let reusableTts = createReusableSpeechSession();
    let warmedAsr: ReturnType<typeof createStreamingAsrSession> | null = null;
    // Agent bridge (lazily initialized in processTranscript when AGENT_INTERVIEW_ENABLED=1)
    let agentBridge: any;
    let voiceProvider: any;
    const interruptedTurns = new Set<string>();

    function isInterrupted(turnId: string): boolean {
      return interruptedTurns.has(turnId);
    }

    function reusableSpeech(text: string, signal?: AbortSignal): AsyncIterable<Buffer> {
      if (process.env.VOICE_PERSISTENT_TTS_ENABLED === "0") {
        return streamSpeechWithQwen({ text, signal });
      }
      if (reusableTts.closed) reusableTts = createReusableSpeechSession();
      return reusableTts.speak(text, signal);
    }

    function warmAsr(): void {
      if (warmedAsr) return;
      warmedAsr = createStreamingAsrSession({ sampleRate: 16000 });
      voiceLog("asr_prewarmed", { sessionId: payload.sessionId });
    }

    async function interrupt(turnId: string) {
      voiceLog("interrupt", { turnId });
      interruptedTurns.add(turnId);
      if (activeTurn?.turnId === turnId) {
        activeTurn.asr.abort();
        activeTurn.abortController.abort();
      }
      if (activePromptTurn?.turnId === turnId) {
        activePromptTurn.abortController.abort();
      }
      try {
        await markTurnInterrupted(supabase, turnId);
      } catch {
        // The assistant message may not exist yet.
      }
      sendJson(ws, { type: "interrupted", turnId });
      sendJson(ws, { type: "generation_cancelled", turnId });
    }

    async function loadQuestionProgress(questionId?: string): Promise<{
      question: VoiceSessionQuestion | null;
      currentQuestionIndex: number;
      totalQuestions: number;
    }> {
      const questions = await listSessionQuestions(supabase, payload.sessionId);
      const question = questionId
        ? questions.find((item) => item.id === questionId) ?? null
        : questions.find((item) => item.score == null) ?? null;
      return {
        question,
        currentQuestionIndex: question?.order_index ?? Math.max(0, questions.length - 1),
        totalQuestions: questions.length,
      };
    }

    async function sendSessionReady(): Promise<void> {
      const progress = await loadQuestionProgress();
      sendJson(ws, {
        type: "session_ready",
        sessionId: payload.sessionId,
        questionId: progress.question?.id ?? null,
        currentQuestionIndex: progress.currentQuestionIndex,
        totalQuestions: progress.totalQuestions,
      });
    }

    function buildQuestionPrompt(
      question: VoiceSessionQuestion,
      totalQuestions: number,
      opening: boolean,
    ): string {
      const ordinal = question.order_index + 1;
      const prefix = opening
        ? "你好，我们开始语音面试。"
        : "好的，下面进入下一题。";
      return `${prefix}第 ${ordinal} 题，共 ${totalQuestions} 题。${question.question}`;
    }

    async function promptQuestion(questionId?: string, opening = false): Promise<void> {
      const progress = await loadQuestionProgress(questionId);
      const question = progress.question;
      if (!question) {
        voiceLog("question_prompt_skipped", {
          sessionId: payload.sessionId,
          requestedQuestionId: questionId,
          reason: "no_unscored_question",
          totalQuestions: progress.totalQuestions,
        });
        return;
      }
      const turnId = `prompt-${question.id}-${Date.now()}`;
      const promptTurn: SpeechTurnState = {
        turnId,
        abortController: new AbortController(),
      };
      activePromptTurn = promptTurn;
      const text = buildQuestionPrompt(question, progress.totalQuestions, opening);

      if (!opening) {
        sendJson(ws, {
          type: "next_question",
          questionId: question.id,
          currentQuestionIndex: progress.currentQuestionIndex,
          totalQuestions: progress.totalQuestions,
        });
      }
      sendJson(ws, {
        type: "interviewer_prompt_start",
        turnId,
        questionId: question.id,
        text,
        currentQuestionIndex: progress.currentQuestionIndex,
        totalQuestions: progress.totalQuestions,
      });
      sendStage(ws, "question_prompt", "TTS: speaking interviewer question", turnId);
      try {
        await speakText(promptTurn, text);
      } finally {
        if (activePromptTurn?.turnId === turnId) activePromptTurn = null;
      }
      if (!isInterrupted(turnId)) {
        sendJson(ws, {
          type: "interviewer_prompt_end",
          turnId,
          questionId: question.id,
        });
        warmAsr();
      }
    }

    async function validateAudioQuestion(questionId: string): Promise<{
      ok: true;
      question: VoiceSessionQuestion;
    } | {
      ok: false;
      code: string;
      message: string;
      detail?: string;
    }> {
      const questions = await listSessionQuestions(supabase, payload.sessionId);
      const question = questions.find((item) => item.id === questionId);
      if (!question) {
        return {
          ok: false,
          code: "VOICE_QUESTION_NOT_FOUND",
          message: "当前语音题目不存在，请刷新语音面试页面",
          detail: `questionId=${questionId}`,
        };
      }
      if (question.score != null) {
        return {
          ok: false,
          code: "VOICE_QUESTION_ALREADY_SCORED",
          message: "当前题目已评分，请等待 AI 进入下一题",
          detail: `questionId=${questionId}, score=${question.score}`,
        };
      }
      const firstUnscored = questions.find((item) => item.score == null);
      if (firstUnscored && firstUnscored.id !== questionId) {
        return {
          ok: false,
          code: "VOICE_QUESTION_OUT_OF_ORDER",
          message: "语音面试题目状态已变化，请等待 AI 面试官继续",
          detail: `expected=${firstUnscored.id}, received=${questionId}`,
        };
      }
      return { ok: true, question };
    }

    async function speakText(turn: SpeechTurnState, text: string): Promise<void> {
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
      for await (const chunk of reusableSpeech(text, turn.abortController.signal)) {
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
      let inlineDecision: import("./voice.types.js").VoiceDecision | null = null;
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
          for await (const chunk of reusableSpeech(text, turn.abortController.signal)) {
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
          const responseEvents = process.env.VOICE_SINGLE_PASS_DECISION_ENABLED === "0"
            ? (async function* () {
                for await (const text of streamVoiceReply(prepared, turn.abortController.signal)) {
                  yield { type: "speech" as const, text };
                }
              })()
            : streamCombinedVoiceTurn(prepared, turn.abortController.signal);
          for await (const event of responseEvents) {
            if (isInterrupted(turn.turnId)) return;
            if (event.type === "decision") {
              inlineDecision = event.decision;
              continue;
            }
            const delta = event.text;
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
          inlineDecision
            ? applyVoiceDecision(prepared, assistantText, inlineDecision)
            : decideVoiceTurn(prepared, assistantText),
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
        if (
          !isInterrupted(turn.turnId) &&
          result.nextQuestionId &&
          !result.sessionCompleted
        ) {
          await promptQuestion(result.nextQuestionId);
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
        sendVoiceError(ws, {
          code: "VOICE_ASR_EMPTY_TRANSCRIPT",
          stage: "asr_final",
          message: "没有识别到有效语音，请检查麦克风后重新回答",
          turnId: turn.turnId,
          retryable: true,
          meta: {
            audioChunks: turn.audioChunks,
            audioBytes: turn.audioBytes,
          },
        });
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

      // Agent Graph path (when AGENT_INTERVIEW_ENABLED=1)
      if (process.env.AGENT_INTERVIEW_ENABLED === "1") {
        try {
          if (!agentBridge) {
            const { createAgentVoiceBridgeService } = await import("../interview-agent/voice-bridge/voice-bridge.service.js");
            const { createInterviewAgentService } = await import("../interview-agent/interview-agent.service.js");
            const { createQwenVoiceProvider } = await import("../interview-agent/providers/qwen-voice.provider.js");
            const agentSvc = createInterviewAgentService(supabase, payload.userId);
            voiceProvider = createQwenVoiceProvider();
            agentBridge = createAgentVoiceBridgeService({
              agentService: agentSvc,
              voiceProvider,
              loadLatestAssistantMessage: async (sid, qid) => {
                const msgs = await listQuestionMessages(supabase, qid);
                return msgs.filter((m) => m.role === "assistant").pop()?.content ?? "";
              },
            });
          }
          const { processTranscriptViaAgent, deriveNextActionFromSnapshot } = await import("../interview-agent/voice-bridge/agent-voice-handler.js");
          const agentResult = await processTranscriptViaAgent({ bridge: agentBridge, sessionId: turn.sessionId, transcript });
          if (isInterrupted(turn.turnId)) return;
          const responseText = agentResult.responseText.trim();
          if (responseText) {
            sendStage(ws, "agent_response", "Agent: speaking interviewer response", turn.turnId);
            sendJson(ws, { type: "assistant_text_delta", text: responseText, turnId: turn.turnId });
            sendJson(ws, { type: "assistant_text_done", turnId: turn.turnId });
            await speakText(turn, responseText);
          }
          const nextAction = deriveNextActionFromSnapshot(agentResult.bridgeResult.snapshot);
          if (nextAction === "finish_session") {
            sendJson(ws, { type: "session_completed", overallScore: 0, overallFeedback: "Agent interview completed." });
          }
          sendStage(ws, "done", "Agent voice turn completed", turn.turnId);
          return;
        } catch (agentError) {
          voiceError("agent_voice_processing_failed", agentError, { turnId: turn.turnId, questionId: turn.questionId });
          if (isInterrupted(turn.turnId) || turn.abortController.signal.aborted) return;
          sendVoiceError(ws, {
            code: "VOICE_AGENT_PROCESSING_FAILED",
            stage: "agent_processing",
            message: agentError instanceof Error ? agentError.message : "Agent processing failed",
            turnId: turn.turnId,
            retryable: true,
            error: agentError,
          });
        }
      }
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
          try {
            await processTranscript(turn, event.text, event.confidence);
          } catch (turnError) {
            voiceError("turn_processing_failed", turnError, {
              turnId: turn.turnId,
              questionId: turn.questionId,
              audioChunks: turn.audioChunks,
              audioBytes: turn.audioBytes,
            });
            if (isInterrupted(turn.turnId) || turn.abortController.signal.aborted) return;
            sendVoiceError(ws, {
              code: "VOICE_TURN_PROCESSING_FAILED",
              stage: "turn_processing",
              message:
                turnError instanceof Error
                  ? turnError.message
                  : "语音面试处理失败，请重试",
              turnId: turn.turnId,
              retryable: true,
              error: turnError,
              meta: {
                questionId: turn.questionId,
                audioChunks: turn.audioChunks,
                audioBytes: turn.audioBytes,
              },
            });
          }
          return;
        }

        if (!finalized && !isInterrupted(turn.turnId)) {
          voiceLog("asr_no_final", {
            turnId: turn.turnId,
            audioChunks: turn.audioChunks,
            audioBytes: turn.audioBytes,
          });
          sendVoiceError(ws, {
            code: "VOICE_ASR_NO_FINAL",
            stage: "asr_stream",
            message: "语音识别没有返回最终结果，请重新回答",
            turnId: turn.turnId,
            retryable: true,
            meta: {
              audioChunks: turn.audioChunks,
              audioBytes: turn.audioBytes,
            },
          });
        }
      } catch (asrError) {
        voiceError("asr_failed", asrError, {
          turnId: turn.turnId,
          audioChunks: turn.audioChunks,
          audioBytes: turn.audioBytes,
        });
        if (isInterrupted(turn.turnId) || turn.abortController.signal.aborted) return;
        sendVoiceError(ws, {
          code: "VOICE_ASR_FAILED",
          stage: "asr_stream",
          message: asrError instanceof Error ? asrError.message : "语音识别失败，请重试",
          turnId: turn.turnId,
          retryable: true,
          error: asrError,
          meta: {
            audioChunks: turn.audioChunks,
            audioBytes: turn.audioBytes,
          },
        });
      } finally {
        if (activeTurn?.turnId === turn.turnId) activeTurn = null;
      }
    }

    function receiveAudioChunk(turn: AudioTurnState, chunk: Buffer): void {
      turn.audioChunks += 1;
      turn.audioBytes += chunk.length;
      if (turn.audioChunks === 1 || turn.audioChunks % 20 === 0) {
        voiceLog("ws_audio_received", {
          turnId: turn.turnId,
          chunks: turn.audioChunks,
          bytes: turn.audioBytes,
        });
        sendStage(
          ws,
          "audio_receiving",
          `WS: received ${turn.audioChunks} audio chunks, ${turn.audioBytes} bytes`,
          turn.turnId,
        );
      }
      turn.asr.sendAudio(chunk);
    }

    function submitAudioTurn(turn: AudioTurnState): void {
      voiceLog("ws_audio_end", {
        turnId: turn.turnId,
        chunks: turn.audioChunks,
        bytes: turn.audioBytes,
      });
      sendStage(
        ws,
        "audio_submitting",
        `WS: submitting ${turn.audioChunks} chunks, ${turn.audioBytes} bytes to ASR`,
        turn.turnId,
      );
      turn.asr.finish();
    }

    async function handleClientEvent(event: VoiceClientEvent): Promise<void> {
      voiceLog("ws_client_event", {
        sessionId: payload.sessionId,
        type: event.type,
        turnId: "turnId" in event ? event.turnId : undefined,
        questionId: "questionId" in event ? event.questionId : undefined,
      });

      if (event.type === "audio_start") {
        voiceLog("ws_audio_start", {
          sessionId: event.sessionId,
          questionId: event.questionId,
          turnId: event.turnId,
          sampleRate: event.sampleRate,
        });
        if (event.sessionId !== payload.sessionId) {
          sendVoiceError(ws, {
            code: "VOICE_SESSION_MISMATCH",
            stage: "audio_start",
            message: "语音连接与当前面试会话不匹配，请刷新页面",
            turnId: event.turnId,
            retryable: false,
            meta: {
              expectedSessionId: payload.sessionId,
              receivedSessionId: event.sessionId,
            },
          });
          return;
        }
        pendingAudioStart = {
          turnId: event.turnId,
          chunks: [],
          bytes: 0,
          finishRequested: false,
        };
        const questionCheck = await validateAudioQuestion(event.questionId);
        if (pendingAudioStart?.turnId !== event.turnId) {
          voiceLog("ws_audio_start_superseded", {
            sessionId: payload.sessionId,
            turnId: event.turnId,
            pendingTurnId: pendingAudioStart?.turnId,
          });
          return;
        }
        if (!questionCheck.ok) {
          pendingAudioStart = null;
          sendVoiceError(ws, {
            code: questionCheck.code,
            stage: "audio_start",
            message: questionCheck.message,
            detail: questionCheck.detail,
            turnId: event.turnId,
            retryable: true,
          });
          return;
        }
        if (activeTurn) {
          voiceLog("ws_audio_start_replaces_active_turn", {
            oldTurnId: activeTurn.turnId,
            nextTurnId: event.turnId,
            oldChunks: activeTurn.audioChunks,
            oldBytes: activeTurn.audioBytes,
          });
          activeTurn.asr.abort();
          activeTurn.abortController.abort();
        }
        const pendingAudio = pendingAudioStart;
        pendingAudioStart = null;
        const abortController = new AbortController();
        const nextTurn: AudioTurnState = {
          sessionId: event.sessionId,
          questionId: event.questionId,
          turnId: event.turnId,
          sampleRate: event.sampleRate,
          audioChunks: 0,
          audioBytes: 0,
          abortController,
          asr: warmedAsr ?? createStreamingAsrSession({
            sampleRate: event.sampleRate,
            signal: abortController.signal,
          }),
        };
        warmedAsr = null;
        activeTurn = nextTurn;
        sendStage(ws, "listening", "WS: receiving microphone audio", event.turnId);
        void consumeAsrEvents(nextTurn);
        if (pendingAudio.chunks.length > 0) {
          voiceLog("ws_audio_replaying_buffered", {
            turnId: event.turnId,
            chunks: pendingAudio.chunks.length,
            bytes: pendingAudio.bytes,
          });
          for (const chunk of pendingAudio.chunks) {
            receiveAudioChunk(nextTurn, chunk);
          }
        }
        if (pendingAudio.finishRequested) {
          submitAudioTurn(nextTurn);
        }
        return;
      }

      if (event.type === "audio_end") {
        if (pendingAudioStart?.turnId === event.turnId) {
          pendingAudioStart.finishRequested = true;
          voiceLog("ws_audio_end_buffered_until_turn_ready", {
            turnId: event.turnId,
            chunks: pendingAudioStart.chunks.length,
            bytes: pendingAudioStart.bytes,
          });
          return;
        }
        if (!activeTurn || activeTurn.turnId !== event.turnId) {
          voiceLog("ws_audio_end_ignored", {
            receivedTurnId: event.turnId,
            activeTurnId: activeTurn?.turnId,
          });
          sendVoiceError(ws, {
            code: "VOICE_AUDIO_END_WITHOUT_ACTIVE_TURN",
            stage: "audio_end",
            message: "没有正在录制的语音回答，请重新开始回答",
            turnId: event.turnId,
            retryable: true,
          });
          return;
        }
        submitAudioTurn(activeTurn);
        return;
      }

      if (event.type === "interrupt") {
        void interrupt(event.turnId);
      }
    }

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const chunk = rawToBuffer(data);
        if (pendingAudioStart) {
          pendingAudioStart.chunks.push(chunk);
          pendingAudioStart.bytes += chunk.length;
          if (
            pendingAudioStart.chunks.length === 1 ||
            pendingAudioStart.chunks.length % 20 === 0
          ) {
            voiceLog("ws_audio_buffered_until_turn_ready", {
              sessionId: payload.sessionId,
              turnId: pendingAudioStart.turnId,
              chunks: pendingAudioStart.chunks.length,
              bytes: pendingAudioStart.bytes,
            });
          }
          return;
        }
        if (!activeTurn) {
          voiceLog("ws_audio_ignored_without_active_turn", {
            sessionId: payload.sessionId,
            bytes: chunk.length,
          });
          return;
        }
        receiveAudioChunk(activeTurn, chunk);
        return;
      }

      const event = parseClientEvent(data);
      if (!event) {
        const text = rawToBuffer(data).toString("utf8");
        voiceLog("ws_client_event_invalid", {
          sessionId: payload.sessionId,
          bytes: rawToBuffer(data).length,
          preview: text.slice(0, 120),
        });
        sendVoiceError(ws, {
          code: "VOICE_CLIENT_EVENT_INVALID",
          stage: "ws_message",
          message: "语音客户端事件格式无效，请刷新页面后重试",
          retryable: true,
        });
        return;
      }

      void handleClientEvent(event).catch((clientError) => {
        voiceError("ws_client_event_failed", clientError, {
          sessionId: payload.sessionId,
          type: event.type,
          turnId: "turnId" in event ? event.turnId : undefined,
        });
        sendVoiceError(ws, {
          code: "VOICE_CLIENT_EVENT_FAILED",
          stage: event.type,
          message: "处理语音客户端事件失败，请重试",
          turnId: "turnId" in event ? event.turnId : undefined,
          retryable: true,
          error: clientError,
        });
      });
    });

    ws.on("close", () => {
      voiceLog("ws_closed", {
        sessionId: payload.sessionId,
        activeTurnId: activeTurn?.turnId,
      });
      activeTurn?.asr.abort();
      activeTurn?.abortController.abort();
      pendingAudioStart = null;
      activePromptTurn?.abortController.abort();
      reusableTts.close();
      warmedAsr?.abort();
    });

    sendJson(ws, { type: "ready", sessionId: payload.sessionId });
    await sendSessionReady();
    voiceLog("ws_ready_sent", { sessionId: payload.sessionId });
    await promptQuestion(undefined, true).catch((promptError) => {
      voiceError("initial_prompt_failed", promptError, {
        sessionId: payload.sessionId,
      });
      sendVoiceError(ws, {
        code: "VOICE_INITIAL_PROMPT_FAILED",
        stage: "question_prompt",
        message:
          promptError instanceof Error
            ? promptError.message
            : "Failed to speak first voice question",
        retryable: true,
        error: promptError,
        meta: { sessionId: payload.sessionId },
      });
    });
  });
}
