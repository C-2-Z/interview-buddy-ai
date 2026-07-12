/**
 * interview-agent Feature 类型定义：Agent 面试会话、事件、API 交互。
 * 与后端 interview-agent.types.ts 保持同步，仅包含前端需要的字段。
 */

/** 面试模式 */
export type AgentMode = "single" | "panel";

/** Agent 阶段 */
export type AgentPhase =
  | "preparing"
  | "awaiting_answer"
  | "reasoning"
  | "speaking"
  | "scoring"
  | "role_handoff"
  | "reporting"
  | "completed"
  | "failed";

/** 角色 ID */
export type AgentRoleId = "general" | "technical" | "manager" | "hr";

/** 待处理动作 */
export type AgentPendingAction = "ask" | "follow_up" | "score" | "handoff" | "finish";

/** Agent 快照（服务端返回给客户端的最小状态）。 */
export type AgentSnapshot = Readonly<{
  sessionId: string;
  threadId: string;
  version: string;
  mode: AgentMode;
  interviewMode: "text" | "voice";
  phase: AgentPhase;
  currentRole: AgentRoleId;
  currentQuestionId: string | null;
  currentQuestionIndex: number;
  followUpCount: number;
  pendingAction: AgentPendingAction;
  eventCursor: number;
}>;

/** Agent 面试创建请求 */
export type CreateAgentSessionBody = Readonly<{
  mode: AgentMode;
  interviewMode: "text" | "voice";
  position: string;
  difficulty: string;
  questionCount: number;
  jobDescription?: string;
  targetCompany?: string;
  skillId?: string;
  resumeId?: string;
  modelProvider?: string;
  modelName?: string;
  webResearch?: boolean;
}>;

/** Agent 面试创建响应（HTTP 202） */
export type CreateAgentSessionResponse = Readonly<{
  sessionId: string;
  threadId: string;
  phase: AgentPhase;
  eventCursor: number;
}>;

/** Agent 文本输入请求 */
export type AgentInputBody = Readonly<{
  inputId: string;
  type: "text";
  content: string;
}>;

/** Agent SSE 事件 */
export type AgentSSEEvent =
  | { sequence: number; type: "agent.snapshot"; data: AgentSnapshot }
  | { sequence: number; type: "agent.phase"; data: { phase: AgentPhase } }
  | { sequence: number; type: "agent.role_changed"; data: { roleId: AgentRoleId } }
  | { sequence: number; type: "agent.question_ready"; data: { id: string; question: string; orderIndex: number; roleId: AgentRoleId } }
  | { sequence: number; type: "agent.message_delta"; data: { text: string; turnId: string } }
  | { sequence: number; type: "agent.message_completed"; data: { text: string; turnId: string; roleId: AgentRoleId } }
  | { sequence: number; type: "agent.score_completed"; data: { questionId: string; score: number } }
  | { sequence: number; type: "agent.session_completed"; data: { overallScore: number; overallFeedback: string } }
  | { sequence: number; type: "agent.error"; data: { code: string; message: string } };

/** Agent 会话视图（从 API GET 返回）。 */
export type AgentSessionView = Readonly<{
  snapshot: AgentSnapshot;
}>;

/** 角色展示信息 */
export type AgentRoleDisplay = Readonly<{
  id: AgentRoleId;
  label: string;
  description: string;
  color: string;
}>;

/** 角色展示映射 */
export const AGENT_ROLE_DISPLAY: Record<AgentRoleId, AgentRoleDisplay> = {
  general: { id: "general", label: "单面试官", description: "负责完整面试体验", color: "bg-blue-500" },
  technical: { id: "technical", label: "技术面试官", description: "技术深度、项目验证", color: "bg-emerald-500" },
  manager: { id: "manager", label: "主管面试官", description: "业务场景、优先级决策", color: "bg-amber-500" },
  hr: { id: "hr", label: "HR 面试官", description: "动机、价值观匹配", color: "bg-purple-500" },
};

/** Phase 展示信息 */
export const AGENT_PHASE_DISPLAY: Record<AgentPhase, string> = {
  preparing: "准备中",
  awaiting_answer: "等待回答",
  reasoning: "思考中",
  speaking: "发言中",
  scoring: "评分中",
  role_handoff: "角色切换",
  reporting: "生成报告",
  completed: "已完成",
  failed: "失败",
};
