/** Interview Agent Phase 3 已持久化输入引用与读取投影类型。 */

/** `accept_agent_input` 的幂等 receipt。 */
export type AgentInputReceipt = {
  /** 首次调用成功保存消息时为 true。 */
  accepted: boolean;
  /** 相同 inputId 已保存时为 true。 */
  duplicate: boolean;
  /** 独立于 Graph 处理操作的 receipt 幂等键。 */
  operationKey: string;
  /** 已保存候选人消息 UUID。 */
  messageId: string;
  /** 接收回答时的当前题目 UUID。 */
  questionId: string;
  /** message_completed 事件序号。 */
  eventSequence: number;
};

/** Guard 和证据节点按 inputId 加载的有限业务消息。 */
export type PersistedAgentInput = {
  /** 客户端或语音 turn 的稳定 inputId。 */
  inputId: string;
  /** 候选人消息 UUID。 */
  messageId: string;
  /** 当前题目 UUID。 */
  questionId: string;
  /** 当前题目正文。 */
  question: string;
  /** 候选人回答正文；只在节点执行期间读取，不写 checkpoint。 */
  content: string;
  /** 文本或语音来源。 */
  source: "text" | "voice";
  /** ISO 8601 保存时间。 */
  createdAt: string;
};

/** interviewer_respond 节点的幂等业务提交结果。 */
export type AgentInterviewerResponseReceipt = {
  /** 首次写入时为 true。 */
  committed: boolean;
  /** 节点重放命中原结果时为 true。 */
  duplicate: boolean;
  /** 确定性响应操作键。 */
  operationKey: string;
  /** 已保存 assistant 消息 UUID。 */
  messageId: string;
  /** 当前题目 UUID。 */
  questionId: string;
  /** 无效输入引导或有效回答追问。 */
  responseType: "redirect" | "follow_up";
  /** 提交后当前题目已使用追问次数；redirect 不增加。 */
  followUpCount: number;
  /** message_completed 事件序号。 */
  eventSequence: number;
};
