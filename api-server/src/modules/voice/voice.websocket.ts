/** Agent-only 语音 WebSocket：Qwen 负责 ASR/TTS，所有流程决策来自持久 Agent 事件。 */
import type { Server } from "node:http";
import type { ServerType } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";
import { createUserClient } from "../../shared/db/supabase.js";
import { createInterviewAgentRepository } from "../interview-agent/interview-agent.repository.js";
import { createInterviewAgentService } from "../interview-agent/interview-agent.service.js";
import type { AgentEvent, RoleId } from "../interview-agent/interview-agent.types.js";
import { createQwenVoiceProvider } from "../interview-agent/providers/qwen-voice.provider.js";
import type {
  StreamingAsrSession,
  VoiceProvider,
} from "../interview-agent/providers/voice.provider.js";
import { createAgentVoiceBridgeService } from "../interview-agent/voice-bridge/voice-bridge.service.js";
import {
  assertVoiceSessionAccess,
  listSessionQuestions,
  type VoiceSessionQuestion,
} from "./voice.repository.js";
import { verifyVoiceSocketToken } from "./voice-token.service.js";
import { voiceError, voiceLog } from "../../shared/logger/voice-logger.js";
import type { VoiceClientEvent, VoiceServerEvent } from "./voice.types.js";

/** 当前正在接收的候选人音频轮次。 */
type AudioTurn = {
  /** 当前题目 UUID。 */ questionId: string;
  /** 客户端稳定轮次 ID。 */ turnId: string;
  /** ASR 会话。 */ asr: StreamingAsrSession;
  /** 取消音频识别和后续处理。 */ abortController: AbortController;
  /** 已收到块数。 */ chunks: number;
  /** 已收到字节数。 */ bytes: number;
};

/** audio_start 验证完成前暂存的音频。 */
type PendingAudio = {
  /** 客户端轮次 ID。 */ turnId: string;
  /** 验证期间到达的 PCM。 */ chunks: Buffer[];
  /** 客户端是否已发送结束。 */ finishRequested: boolean;
};

/** 当前正在播放的 TTS。 */
type SpeechTurn = {
  /** 输出轮次 ID。 */ turnId: string;
  /** 取消当前 PCM 流。 */ abortController: AbortController;
};

const ROLE_LABELS: Record<RoleId, string> = {
  general: "面试官",
  technical: "技术面试官",
  manager: "主管面试官",
  hr: "HR 面试官",
};

/** 只在连接仍打开时发送结构化事件。 */
function sendJson(socket: WebSocket, event: VoiceServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

/** 将任意错误映射为不含 Provider 密钥的固定客户端错误。 */
function sendError(
  socket: WebSocket,
  code: string,
  stage: string,
  message: string,
  turnId?: string,
): void {
  sendJson(socket, { type: "error", code, stage, message, turnId, retryable: true });
}

/** 发送可观察但不参与控制流的语音阶段。 */
function sendStage(socket: WebSocket, stage: string, message: string, turnId?: string): void {
  sendJson(socket, { type: "voice_stage", stage, message, turnId });
}

/** 归一化 ws 二进制载荷。 */
function rawToBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(new Uint8Array(data));
}

/** 解析客户端 JSON 控制事件；未知结构由业务分支拒绝。 */
function parseClientEvent(data: WebSocket.RawData): VoiceClientEvent | null {
  try {
    const value = JSON.parse(rawToBuffer(data).toString("utf8")) as VoiceClientEvent;
    return value && typeof value.type === "string" ? value : null;
  } catch {
    return null;
  }
}

/** 从题目投影定位当前未评分题目。 */
function currentQuestion(questions: VoiceSessionQuestion[]): VoiceSessionQuestion | null {
  return questions.find((question) => question.score == null) ?? null;
}

/** 将评分维度理由压缩为旧语音 UI 可展示的 feedback。 */
function scoreFeedback(event: Extract<AgentEvent, { type: "agent.score_completed" }>): string {
  return Object.values(event.data.dimensions)
    .map((dimension) => dimension.rationale)
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
}

/** 为一个已鉴权 Agent 语音会话安装消息处理器。 */
async function attachAgentVoiceSession(
  socket: WebSocket,
  supabase: ReturnType<typeof createUserClient>,
  userId: string,
  sessionId: string,
): Promise<void> {
  const agentService = createInterviewAgentService(supabase, userId);
  const eventReader = createInterviewAgentRepository(supabase);
  const voiceProvider: VoiceProvider = createQwenVoiceProvider();
  const bridge = createAgentVoiceBridgeService({ agentService, eventReader, voiceProvider });
  let activeAudio: AudioTurn | null = null;
  let pendingAudio: PendingAudio | null = null;
  let activeSpeech: SpeechTurn | null = null;
  const interrupted = new Set<string>();

  /** 播放完整 Agent 文本；单 Provider 长连接可连续处理多轮 speak。 */
  async function speak(text: string, turnId: string): Promise<void> {
    const content = text.trim();
    if (!content || interrupted.has(turnId)) return;
    const speech: SpeechTurn = { turnId, abortController: new AbortController() };
    activeSpeech = speech;
    sendJson(socket, { type: "assistant_text", text: content, turnId });
    sendJson(socket, { type: "assistant_text_done", turnId });
    sendJson(socket, {
      type: "assistant_audio_start",
      turnId,
      sampleRate: voiceProvider.outputSampleRate,
    });
    let sequence = 0;
    try {
      for await (const chunk of voiceProvider.speak(
        { text: content },
        speech.abortController.signal,
      )) {
        if (interrupted.has(turnId) || speech.abortController.signal.aborted) return;
        sequence += 1;
        sendJson(socket, {
          type: "assistant_audio_chunk",
          turnId,
          sequence,
          byteLength: chunk.length,
        });
        if (socket.readyState === WebSocket.OPEN) socket.send(chunk);
      }
      if (!interrupted.has(turnId)) sendJson(socket, { type: "assistant_audio_end", turnId });
    } finally {
      if (activeSpeech?.turnId === turnId) activeSpeech = null;
    }
  }

  /** 读取题目投影并播报当前题；连接恢复只读，不推进 Graph。 */
  async function promptQuestion(questionId?: string, opening = false): Promise<void> {
    const questions = await listSessionQuestions(supabase, sessionId);
    const question = questionId
      ? (questions.find((item) => item.id === questionId) ?? null)
      : currentQuestion(questions);
    if (!question) return;
    const turnId = `question:${question.id}`;
    const text = `${opening ? "你好，我们开始面试。" : "下面进入下一题。"}第 ${question.order_index + 1} 题，共 ${questions.length} 题。${question.question}`;
    if (!opening) {
      sendJson(socket, {
        type: "next_question",
        questionId: question.id,
        currentQuestionIndex: question.order_index,
        totalQuestions: questions.length,
      });
    }
    sendJson(socket, {
      type: "interviewer_prompt_start",
      turnId,
      questionId: question.id,
      text,
      currentQuestionIndex: question.order_index,
      totalQuestions: questions.length,
    });
    await speak(text, turnId);
    if (!interrupted.has(turnId)) {
      sendJson(socket, { type: "interviewer_prompt_end", turnId, questionId: question.id });
    }
  }

  /** 将本次 Graph 新增事件依序翻译为字幕、TTS、评分和报告事件。 */
  async function playAgentEvents(events: AgentEvent[], sourceTurnId: string): Promise<void> {
    for (const event of events) {
      if (event.type === "agent.role_changed") {
        await speak(
          `接下来由${ROLE_LABELS[event.data.roleId]}继续面试。`,
          `${sourceTurnId}:role:${event.sequence}`,
        );
      } else if (event.type === "agent.message_completed") {
        await speak(event.data.content, `${sourceTurnId}:message:${event.sequence}`);
      } else if (event.type === "agent.score_completed") {
        sendJson(socket, {
          type: "question_scored",
          questionId: event.data.questionId,
          score: event.data.overallScore,
          feedback: scoreFeedback(event),
        });
      } else if (event.type === "agent.question_ready") {
        await promptQuestion(event.data.id);
      } else if (event.type === "agent.session_completed" && "overallScore" in event.data) {
        await speak(
          `本场面试已完成，综合得分 ${event.data.overallScore} 分。${event.data.overallFeedback}`,
          `${sourceTurnId}:report:${event.sequence}`,
        );
        sendJson(socket, {
          type: "session_completed",
          overallScore: event.data.overallScore,
          overallFeedback: event.data.overallFeedback,
        });
      }
    }
  }

  /** 将 ASR 最终文本提交到 Canonical Agent，并只播放首次提交产生的事件。 */
  async function processTranscript(turn: AudioTurn, transcript: string): Promise<void> {
    const content = transcript.trim();
    if (!content) {
      sendError(socket, "VOICE_ASR_EMPTY", "asr", "没有识别到有效语音，请重新回答", turn.turnId);
      return;
    }
    sendJson(socket, { type: "transcript_final", text: content, turnId: turn.turnId });
    sendStage(socket, "agent_reasoning", "Agent 正在处理已持久化回答", turn.turnId);
    const result = await bridge.submitVoiceInput(sessionId, turn.turnId, content);
    if (!result.duplicate && !interrupted.has(turn.turnId)) {
      await playAgentEvents(result.events, turn.turnId);
    }
    sendStage(
      socket,
      "done",
      result.duplicate ? "该语音轮次已处理" : "语音轮次已完成",
      turn.turnId,
    );
  }

  /** 消费 ASR partial/final；final 之后才恢复 Graph。 */
  async function consumeAsr(turn: AudioTurn): Promise<void> {
    try {
      for await (const event of turn.asr.events) {
        if (turn.abortController.signal.aborted) return;
        if (event.type === "partial") {
          sendJson(socket, { type: "transcript_partial", text: event.text, turnId: turn.turnId });
        } else if (event.type === "final") {
          await processTranscript(turn, event.text);
          return;
        }
      }
      if (!turn.abortController.signal.aborted) {
        sendError(socket, "VOICE_ASR_NO_FINAL", "asr", "语音识别没有返回最终文本", turn.turnId);
      }
    } catch (error) {
      if (!turn.abortController.signal.aborted) {
        voiceError("agent_voice_turn_failed", error, { sessionId, turnId: turn.turnId });
        sendError(
          socket,
          "VOICE_AGENT_FAILED",
          "agent",
          "语音回答处理失败，请使用同一轮次重试",
          turn.turnId,
        );
      }
    } finally {
      if (activeAudio?.turnId === turn.turnId) activeAudio = null;
    }
  }

  /** 校验音频必须属于当前 Agent 题目，阻止断线旧页面跳题。 */
  async function validateQuestion(questionId: string): Promise<boolean> {
    const questions = await listSessionQuestions(supabase, sessionId);
    return currentQuestion(questions)?.id === questionId;
  }

  /** 开始 ASR，并回放验证期间缓存的 PCM。 */
  async function startAudio(
    event: Extract<VoiceClientEvent, { type: "audio_start" }>,
  ): Promise<void> {
    if (event.sessionId !== sessionId || !(await validateQuestion(event.questionId))) {
      pendingAudio = null;
      sendError(
        socket,
        "VOICE_QUESTION_STALE",
        "audio_start",
        "当前题目已变化，请刷新会话",
        event.turnId,
      );
      return;
    }
    if (activeSpeech) await interruptOutput(activeSpeech.turnId);
    activeAudio?.asr.abort();
    activeAudio?.abortController.abort();
    const controller = new AbortController();
    const turn: AudioTurn = {
      questionId: event.questionId,
      turnId: event.turnId,
      abortController: controller,
      asr: voiceProvider.createAsrSession({
        sampleRate: event.sampleRate,
        signal: controller.signal,
      }),
      chunks: 0,
      bytes: 0,
    };
    const buffered = pendingAudio?.turnId === event.turnId ? pendingAudio : null;
    pendingAudio = null;
    activeAudio = turn;
    void consumeAsr(turn);
    for (const chunk of buffered?.chunks ?? []) receiveAudio(turn, chunk);
    if (buffered?.finishRequested) turn.asr.finish();
    sendStage(socket, "listening", "正在接收麦克风音频", event.turnId);
  }

  /** 把一个 PCM 块送入当前 ASR。 */
  function receiveAudio(turn: AudioTurn, chunk: Buffer): void {
    turn.chunks += 1;
    turn.bytes += chunk.length;
    turn.asr.sendAudio(chunk);
  }

  /** 中止 ASR 或 TTS，清除服务端残留音频。 */
  async function interruptOutput(turnId: string): Promise<void> {
    interrupted.add(turnId);
    if (activeAudio?.turnId === turnId) {
      activeAudio.asr.abort();
      activeAudio.abortController.abort();
      activeAudio = null;
    }
    if (activeSpeech?.turnId === turnId) {
      activeSpeech.abortController.abort();
      activeSpeech = null;
    }
    await bridge.interruptVoiceOutput(sessionId, turnId);
    sendJson(socket, { type: "interrupted", turnId });
    sendJson(socket, { type: "generation_cancelled", turnId });
  }

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      const chunk = rawToBuffer(data);
      if (pendingAudio) pendingAudio.chunks.push(chunk);
      else if (activeAudio) receiveAudio(activeAudio, chunk);
      return;
    }
    const event = parseClientEvent(data);
    if (!event) {
      sendError(socket, "VOICE_EVENT_INVALID", "websocket", "语音控制事件格式无效");
      return;
    }
    if (event.type === "audio_start") {
      if (
        !/^[A-Za-z0-9:_-]{1,160}$/.test(event.turnId) ||
        event.sampleRate < 8_000 ||
        event.sampleRate > 48_000
      ) {
        sendError(socket, "VOICE_AUDIO_INVALID", "audio_start", "语音轮次参数无效", event.turnId);
        return;
      }
      pendingAudio = { turnId: event.turnId, chunks: [], finishRequested: false };
      void startAudio(event);
    } else if (event.type === "audio_end") {
      if (pendingAudio?.turnId === event.turnId) pendingAudio.finishRequested = true;
      else if (activeAudio?.turnId === event.turnId) activeAudio.asr.finish();
    } else if (event.type === "interrupt") {
      void interruptOutput(event.turnId);
    }
  });

  socket.on("close", () => {
    activeAudio?.asr.abort();
    activeAudio?.abortController.abort();
    activeSpeech?.abortController.abort();
    void voiceProvider.close();
  });

  const view = await agentService.getSession(sessionId);
  const questions = await listSessionQuestions(supabase, sessionId);
  const question = currentQuestion(questions);
  sendJson(socket, { type: "ready", sessionId });
  sendJson(socket, {
    type: "session_ready",
    sessionId,
    questionId: view.snapshot.currentQuestionId,
    currentQuestionIndex: view.snapshot.currentQuestionIndex,
    totalQuestions: questions.length,
  });
  if (view.snapshot.phase !== "completed" && question) await promptQuestion(question.id, true);
}

/** 将 Agent 语音升级路径注册到现有 HTTP Server。 */
export function installVoiceWebSocket(server: ServerType): void {
  const httpServer = server as unknown as Server;
  const websocketServer = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/api/voice/ws") return;
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });
  websocketServer.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const payload = verifyVoiceSocketToken(url.searchParams.get("token"));
    if (!payload) {
      sendError(socket, "VOICE_TOKEN_INVALID", "auth", "语音连接已过期，请重新连接");
      socket.close(1008, "Invalid token");
      return;
    }
    const supabase = createUserClient(payload.accessToken);
    const { data, error } = await supabase.auth.getClaims(payload.accessToken);
    if (error || data?.claims?.sub !== payload.userId) {
      socket.close(1008, "Unauthorized");
      return;
    }
    try {
      await assertVoiceSessionAccess(supabase, payload.sessionId);
      await attachAgentVoiceSession(socket, supabase, payload.userId, payload.sessionId);
    } catch (error) {
      voiceError("agent_voice_connection_failed", error, { sessionId: payload.sessionId });
      sendError(socket, "VOICE_SESSION_UNAVAILABLE", "session", "语音 Agent 会话不可用");
      socket.close(1011, "Session unavailable");
    }
  });
}
