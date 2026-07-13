/** Interview lifecycle 模块类型：定义暂停、恢复、提前结束、放弃与删除的安全契约。 */

/** 用户可执行的会话生命周期动作。 */
export type InterviewLifecycleAction = "pause" | "resume" | "finish" | "abandon";

/** 面向产品展示的会话状态，不复用 LangGraph 技术阶段。 */
export type InterviewProductStatus =
  "in_progress" | "paused" | "completed" | "abandoned" | "failed";

/** 数据库 RPC 返回的生命周期投影。 */
export type InterviewLifecycleResult = Readonly<{
  /** 业务会话 UUID。 */
  sessionId: string;
  /** 动作完成后的产品状态。 */
  status: InterviewProductStatus;
  /** 是否已有可读取的完整或阶段性报告。 */
  reportAvailable: boolean;
  /** 已完成评分的题目数。 */
  evaluatedQuestionCount: number;
  /** 本场配置的总题数。 */
  totalQuestionCount: number;
}>;

/** 删除业务数据与 checkpoint 后的确认结果。 */
export type InterviewDeleteResult = Readonly<{
  /** 已删除的业务会话 UUID。 */
  sessionId: string;
  /** 固定为 true，便于客户端幂等收口。 */
  deleted: true;
}>;
