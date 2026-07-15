/** Agent 工作台只读投影类型：题目、消息、研究、证据、评分和报告。 */
import type { AgentActivity, AgentSnapshot, AgentStrategyView, RoleId } from "../interview-agent.types.js";

/** 工作台中的一条已持久化消息。 */
export type AgentWorkspaceMessage = {
  /** 消息 UUID。 */ id: string;
  /** 用户或面试官。 */ role: "user" | "assistant";
  /** 完整文本。 */ content: string;
  /** 文本或语音来源。 */ source: "text" | "voice";
  /** 是否被打断。 */ interrupted: boolean;
  /** ISO 创建时间。 */ createdAt: string;
};

/** 工作台中的一题及其冻结结果。 */
export type AgentWorkspaceQuestion = {
  /** 题目 UUID。 */ id: string;
  /** 题目正文。 */ question: string;
  /** 零基题号。 */ orderIndex: number;
  /** 冻结角色。 */ roleId: RoleId;
  /** 主能力维度。 */ dimensionKey: string;
  /** 题库或模型来源。 */ source: "bank" | "model";
  /** 兼容投影分数。 */ score: number | null;
  /** 兼容投影反馈。 */ feedback: string | null;
  /** 该题全部对话。 */ messages: AgentWorkspaceMessage[];
  /** 真实回答证据。 */ evidence: Array<{
    /** 证据 UUID。 */ id: string;
    /** 能力维度。 */ dimensionKey: string;
    /** 模型提取的事实。 */ claim: string;
    /** 候选人逐字原文。 */ quote: string;
  }>;
  /** 冻结逐维评分；尚未评分时为 null。 */
  evaluation: null | {
    /** 代码加权总分。 */ overallScore: number;
    /** 逐维分数、理由与证据引用。 */ dimensions: Record<string, {
      /** 是否观察到足够证据。 */ status: "scored" | "not_observed";
      /** 未观察维度为 null。 */ score: number | null;
      /** 基于证据的理由。 */ rationale: string;
      /** 引用证据 UUID。 */ evidenceIds: string[];
    }>;
  };
};

/** 页面恢复所需的一次性只读工作台。 */
export type AgentWorkspace = {
  /** 面向用户的会话状态；暂停不改变 Graph 技术阶段。 */
  productStatus: "in_progress" | "paused" | "completed" | "abandoned" | "failed";
  /** 与事件流一致的最新快照。 */ snapshot: AgentSnapshot;
  /** 冻结创建配置摘要。 */ config: {
    /** 目标岗位。 */ position: string;
    /** 难度。 */ difficulty: string;
    /** 冻结题量。 */ questionCount: number;
    /** 目标公司。 */ targetCompany: string | null;
    /** 真实模拟或实时教练。 */ experienceMode: "simulation" | "coaching";
  };
  /** 准备研究状态与可追溯来源。 */ research: {
    /** 研究状态。 */ status: "pending" | "running" | "completed" | "skipped" | "failed";
    /** 来源列表。 */ sources: Array<{
      /** 来源 UUID。 */ id: string;
      /** 公司、岗位或行业。 */ category: "company" | "role" | "industry";
      /** 页面标题。 */ title: string;
      /** 来源 URL。 */ url: string;
    }>;
  };
  /** 全部冻结题目。 */ questions: AgentWorkspaceQuestion[];
  /** 完成后的冻结报告投影。 */ report: null | {
    /** 综合得分。 */ overallScore: number;
    /** 综合反馈。 */ overallFeedback: string;
    /** 雷达图兼容汇总。 */ dimensionSummary: unknown;
  };
  /** v2 最新战术策略；v1 或尚未规划时为 null。 */
  strategy: AgentStrategyView | null;
  /** 不含 Prompt、思维链或工具原文的用户可见行动。 */
  activities: AgentActivity[];
};
