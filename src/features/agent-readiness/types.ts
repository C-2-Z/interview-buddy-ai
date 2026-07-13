/** Agent readiness 前端状态、能力和恢复动作契约。 */

/** 聚合及单项能力状态。 */
export type ReadinessStatus = "ready" | "degraded" | "blocked";

/** 后端允许前端执行的固定恢复动作。 */
export type ReadinessRecoveryAction =
  "open_settings" | "retry" | "use_text" | "disable_research" | "contact_admin";

/** 单项能力的用户可见状态。 */
export type ReadinessCapability = {
  /** 能力状态。 */ status: ReadinessStatus;
  /** 脱敏状态说明。 */ message: string;
};

/** 一条阻断或降级原因。 */
export type ReadinessIssue = {
  /** 稳定原因码。 */ code: string;
  /** 用户可理解的说明。 */ message: string;
  /** 推荐恢复动作。 */ recoveryAction: ReadinessRecoveryAction;
};

/** readiness API 响应。 */
export type AgentReadinessResponse = {
  /** 当前所选方案的最终状态。 */ status: ReadinessStatus;
  /** 会话是否可跨服务重启恢复。 */ checkpointMode: "durable" | "ephemeral" | "unavailable";
  /** 可独立降级的能力。 */ capabilities: {
    /** 文本能力。 */ text: ReadinessCapability;
    /** 语音能力。 */ voice: ReadinessCapability;
    /** 实时语音识别能力。 */ voiceRecognition: ReadinessCapability;
    /** 实时语音播报能力。 */ voiceSynthesis: ReadinessCapability;
    /** 联网研究能力。 */ webResearch: ReadinessCapability;
  };
  /** 阻止提交的原因。 */ blockers: ReadinessIssue[];
  /** 允许继续但需确认的降级原因。 */ warnings: ReadinessIssue[];
  /** 后端实际检查的模型供应商。 */ effectiveModelProvider: "deepseek" | "openai" | "anthropic";
};

/** 会改变 readiness 结论的创建选项。 */
export type AgentReadinessInput = {
  /** 当前交互方式。 */ interviewMode: "text" | "voice";
  /** 用户选择的模型供应商。 */ modelProvider: "deepseek" | "openai" | "anthropic";
  /** 是否请求联网研究。 */ webResearch: boolean;
};
