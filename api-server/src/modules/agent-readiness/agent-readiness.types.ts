/** Agent readiness 模块的安全状态、能力与恢复动作契约。 */

/** 创建前检查的聚合状态。 */
export type ReadinessStatus = "ready" | "degraded" | "blocked";

/** 用户可执行的固定恢复动作。 */
export type ReadinessRecoveryAction =
  "open_settings" | "retry" | "use_text" | "disable_research" | "contact_admin";

/** 单项能力的可用性，不包含凭据或内部错误。 */
export type ReadinessCapability = {
  /** 能力当前状态。 */ status: ReadinessStatus;
  /** 面向用户的状态说明。 */ message: string;
};

/** 阻断或降级原因及其唯一推荐动作。 */
export type ReadinessIssue = {
  /** 稳定、可用于前端映射的原因码。 */ code: string;
  /** 不包含内部实现细节的用户提示。 */ message: string;
  /** 用户可立即执行的恢复动作。 */ recoveryAction: ReadinessRecoveryAction;
};

/** readiness API 的完整脱敏响应。 */
export type AgentReadinessResponse = {
  /** 新会话固定采用的单一 Agent 3 运行时。 */ agentVersion: "agent-v3";
  /** 当前所选创建方案的最终状态。 */ status: ReadinessStatus;
  /** checkpoint 的恢复保证。 */ checkpointMode: "durable" | "ephemeral" | "unavailable";
  /** 文本、语音与联网研究的独立状态。 */ capabilities: {
    /** 普通文本面试能力。 */ text: ReadinessCapability;
    /** 语音面试能力。 */ voice: ReadinessCapability;
    /** Qwen 实时语音识别能力。 */ voiceRecognition: ReadinessCapability;
    /** Qwen 实时语音播报能力。 */ voiceSynthesis: ReadinessCapability;
    /** 开场前联网研究能力。 */ webResearch: ReadinessCapability;
  };
  /** 会阻止当前方案创建的问题。 */ blockers: ReadinessIssue[];
  /** 不阻止当前方案创建但需要知情的问题。 */ warnings: ReadinessIssue[];
  /** 后端实际采用的模型供应商。 */ effectiveModelProvider: "deepseek" | "openai" | "anthropic";
};

/** repository 只读基础设施检查结果。 */
export type AgentReadinessInfrastructure = {
  /** Agent 业务迁移及只读 RPC 是否可访问。 */ agentDatabaseReady: boolean;
  /** Agent 3 增量迁移和原子审计 RPC 是否已部署。 */ agentV3DatabaseReady: boolean;
  /** PostgreSQL checkpoint 表是否已经显式初始化。 */ checkpointSchemaReady: boolean;
};
