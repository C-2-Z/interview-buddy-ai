/** 将 Agent 首题事件与持久快照归一为幂等语音播报请求。 */

/** 播报监听器所需的最小安全状态。 */
export type VoicePromptListenerInput = Readonly<{
  /** 语音 WebSocket 是否已打开。 */ connected: boolean;
  /** 最近一个 Agent 事件的题目载荷。 */ lastEvent: { type: string; questionId?: string } | null;
  /** 持久快照中的当前题目 ID，用于事件先于连接时补发。 */ snapshotQuestionId: string | null;
  /** 当前连接已经请求过的题目 ID。 */ lastRequestedQuestionId: string | null;
}>;

/** 选择本次需要播报的题目；未连接和重复题目返回 null。 */
export function selectVoicePromptQuestion(input: VoicePromptListenerInput): string | null {
  if (!input.connected) return null;
  const eventQuestionId =
    input.lastEvent?.type === "agent.question_ready" ? input.lastEvent.questionId : null;
  const questionId = eventQuestionId ?? input.snapshotQuestionId;
  if (!questionId || questionId === input.lastRequestedQuestionId) return null;
  return questionId;
}
