/**
 * Agent 语音桥接服务：将语音 ASR 转录接入 Agent Graph，
 * 并将 Graph 响应映射到语音 TTS 输出。
 * Phase 5：PCM → ASR → VoiceBridge → Agent Graph → VoiceBridge → TTS → PCM。
 */
import { randomUUID } from "node:crypto";
import type { AgentSnapshot } from "../interview-agent.types.js";
import type { InterviewAgentService } from "../interview-agent.service.js";
import type { VoiceProvider } from "../providers/voice.provider.js";
import { createModuleLogger } from "../../voice/voice-logger.js";

const logger = createModuleLogger("voice-bridge");

/** VoiceBridge 提交语音输入后的结果 */
export type VoiceBridgeResult = Readonly<{
  /** Agent 快照，包含最新 phase / role / questionId。 */
  snapshot: AgentSnapshot;
  /** 面试官的响应文本（用于 TTS）。 */
  responseText: string;
  /** 幂等输入标识（与 submitInput 的 inputId 一致）。 */
  inputId: string;
}>;

/** VoiceBridge 依赖项 */
export type VoiceBridgeDependencies = Readonly<{
  agentService: InterviewAgentService;
  voiceProvider: VoiceProvider;
  /** 加载指定会话和问题的面试官最新回答。 */
  loadLatestAssistantMessage: (
    sessionId: string,
    questionId: string,
  ) => Promise<string>;
}>;

/**
 * AgentVoiceBridgeService — 将语音输入提交到 Agent Graph 并返回响应。
 *
 * 职责：
 * 1. 生成 inputId 并将 ASR 转录提交到 submitInput (source: "voice")
 * 2. Graph 运行 guard → evidence → decide → respond 后，读取面试官响应
 * 3. 返回响应文本供外部 TTS
 */
export class AgentVoiceBridgeService {
  private readonly deps: VoiceBridgeDependencies;

  constructor(deps: VoiceBridgeDependencies) {
    this.deps = deps;
  }

  /**
   * 将语音 ASR 转录提交到 Agent Graph，并等待面试官响应。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param transcript - ASR 转录文本。
   * @returns 包含快照、响应文本和 inputId 的结果。
   */
  async submitVoiceInput(
    sessionId: string,
    transcript: string,
  ): Promise<VoiceBridgeResult> {
    const inputId = `voice-${randomUUID()}`;
    logger.info("Submitting voice input to Agent Graph", {
      sessionId,
      inputId,
      transcriptLength: transcript.length,
    });

    // 步骤 1: 提交输入并恢复 Graph
    const result = await this.deps.agentService.submitInput(
      sessionId,
      { inputId, type: "text", content: transcript },
      "voice",
    );

    // 步骤 2: 从快照获取当前问题 ID
    const snapshot = result.snapshot;
    const questionId = snapshot.currentQuestionId;

    // 步骤 3: 加载面试官对当前问题的回答
    let responseText = "";
    if (questionId) {
      responseText = await this.deps.loadLatestAssistantMessage(
        sessionId,
        questionId,
      );
      logger.debug("Loaded assistant response for voice TTS", {
        sessionId,
        questionId,
        responseLength: responseText.length,
      });
    }

    return { snapshot, responseText, inputId };
  }

  /**
   * 打断当前 Agent 会话的语音输出。
   * 同时调用 Agent 的 interruptSession 和 VoiceProvider 的 interrupt。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param turnId - 被打断的语音 turn ID。
   */
  async interruptVoiceOutput(
    sessionId: string,
    turnId: string,
  ): Promise<void> {
    logger.info("Interrupting voice output", { sessionId, turnId });
    await this.deps.agentService.interruptSession(sessionId);
    await this.deps.voiceProvider.interrupt(turnId);
  }
}

/**
 * 从 Agent 会话ID和问题ID返回的的桥接配置创建默认依赖。
 */
export type CreateVoiceBridgeDependenciesParams = Readonly<{
  agentService: InterviewAgentService;
  voiceProvider: VoiceProvider;
  /** 加载指定会话和问题的面试官最新回答。 */
  loadLatestAssistantMessage: (
    sessionId: string,
    questionId: string,
  ) => Promise<string>;
}>;

export function createAgentVoiceBridgeService(
  params: CreateVoiceBridgeDependenciesParams,
): AgentVoiceBridgeService {
  return new AgentVoiceBridgeService({
    agentService: params.agentService,
    voiceProvider: params.voiceProvider,
    loadLatestAssistantMessage: params.loadLatestAssistantMessage,
  });
}

