/**
 * Agent 语音处理器：为语音 WebSocket 提供"转录 → Agent Graph → TTS 响应"的简化路径。
 * 当 AGENT_INTERVIEW_ENABLED=1 时替换原有 prepareVoiceTurn → processPreparedTurn → decideVoiceTurn 管道。
 */
import { createModuleLogger } from "../../voice/voice-logger.js";
import type { AgentVoiceBridgeService, VoiceBridgeResult } from "./voice-bridge.service.js";

const logger = createModuleLogger("agent-voice-handler");

/** Agent 语音处理结果，与 VoiceTurnResult 对齐以便调用方统一处理。 */
export type AgentVoiceProcessResult = Readonly<{
  /** 面试官响应文本（已从 Agent Graph 加载）。 */
  responseText: string;
  /** Agent 快照。 */
  bridgeResult: VoiceBridgeResult;
  /** 是否应发送 question_scored / session_completed 事件。 */
  disposition: "awaiting_answer" | "completed" | "failed";
}>;

/** Agent 语音处理器参数 */
export type AgentVoiceHandlerParams = Readonly<{
  bridge: AgentVoiceBridgeService;
  sessionId: string;
  transcript: string;
}>;

/**
 * 将语音转录提交到 Agent Graph 并获取面试官响应。
 *
 * 流程：
 * 1. bridge.submitVoiceInput(sessionId, transcript)
 *    → inputRepository.acceptInput (source: "voice")
 *    → Graph Resume (guard → evidence → decide → respond)
 *    → commitOperation → events
 * 2. 从 bridge 结果读取 responseText
 * 3. 调用方将 responseText 送入 TTS
 *
 * @param params - 桥接服务和输入参数。
 * @returns 包含响应文本和 Agent 快照的结果。
 */
export async function processTranscriptViaAgent(
  params: AgentVoiceHandlerParams,
): Promise<AgentVoiceProcessResult> {
  const { bridge, sessionId, transcript } = params;
  const inputText = transcript.trim();

  if (!inputText) {
    logger.warn("Empty voice transcript submitted to Agent Graph", { sessionId });
    return {
      responseText: "",
      bridgeResult: null as unknown as VoiceBridgeResult,
      disposition: "failed",
    };
  }

  logger.info("Processing voice transcript via Agent Graph", {
    sessionId,
    textLength: inputText.length,
  });

  // 步骤 1：提交到 Agent Graph
  const bridgeResult = await bridge.submitVoiceInput(sessionId, inputText);

  // 步骤 2：根据快照判断后续动作
  const snapshot = bridgeResult.snapshot;
  const phase = snapshot.phase;
  const disposition =
    phase === "completed" ? "completed"
    : phase === "failed" ? "failed"
    : "awaiting_answer";

  logger.info("Agent voice processing completed", {
    sessionId,
    phase,
    pendingAction: snapshot.pendingAction,
    currentQuestionId: snapshot.currentQuestionId,
    responseLength: bridgeResult.responseText.length,
  });

  return {
    responseText: bridgeResult.responseText,
    bridgeResult,
    disposition,
  };
}

/**
 * 从 Agent 快照推导下一次语音动作（与 VoiceTurnResult 对齐）。
 *
 * @param snapshot - Agent 快照。
 * @returns 下一个动作类型。
 */
export function deriveNextActionFromSnapshot(
  snapshot: Readonly<{ phase: string; pendingAction: string }>,
): "follow_up" | "finish_question" | "finish_session" | "wait" {
  const pendingAction = snapshot.pendingAction;

  if (pendingAction === "finish" || snapshot.phase === "completed") {
    return "finish_session";
  }
  if (pendingAction === "follow_up") {
    return "follow_up";
  }
  // 新题目或角色切换后，等待用户回答
  return "wait";
}
