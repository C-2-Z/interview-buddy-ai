/** Interview Agent Phase 4 证据、冻结量表与版本化评分类型。 */

/** 一条只来自候选人消息的证据草稿。 */
export type AnswerEvidenceDraft = {
  /** 服务生成的证据 UUID。 */
  id: string;
  /** 候选人消息 UUID。 */
  messageId: string;
  /** 冻结量表维度键。 */
  dimensionKey: string;
  /** 对引用事实的简短归纳。 */
  claim: string;
  /** 必须能在候选人原消息中找到的原文。 */
  quote: string;
  /** 事实对能力判断的方向。 */
  polarity: "positive" | "negative" | "neutral";
  /** 0–1 提取置信度。 */
  confidence: number;
};

/** 冻结量表的一个维度。 */
export type FrozenRubricDimension = {
  /** 稳定维度键。 */
  key: string;
  /** 展示名称。 */
  label: string;
  /** 加权计算使用的正权重。 */
  weight: number;
};

/** 模型对一个维度的评分输出。 */
export type EvaluationDimension = {
  /** 有证据并参与总分，或本题未观察到且排除聚合。 */
  status: "scored" | "not_observed";
  /** 0–100 整数分。 */
  score: number | null;
  /** 基于证据的简洁理由。 */
  rationale: string;
  /** 只引用本次已验证证据 UUID。 */
  evidenceIds: string[];
};

/** 可持久化的版本化逐题评分。 */
export type QuestionEvaluation = {
  /** 冻结量表版本。 */
  rubricVersion: string;
  /** Prompt 版本。 */
  promptVersion: string;
  /** 实际模型供应商。 */
  modelProvider: string;
  /** 实际模型名称。 */
  modelName: string;
  /** 每个冻结维度的评分。 */
  dimensions: Record<string, EvaluationDimension>;
  /** 由代码加权计算的 0–100 总分。 */
  overallScore: number;
  /** 给候选人的改进反馈。 */
  feedback: string;
};

/** 评分上下文中的候选人消息。 */
export type EvaluationCandidateMessage = {
  /** 消息 UUID。 */
  id: string;
  /** 回答正文。 */
  content: string;
};

/** Repository 加载的逐题冻结上下文。 */
export type QuestionEvaluationContext = {
  /** 会话 UUID。 */
  sessionId: string;
  /** 题目 UUID。 */
  questionId: string;
  /** 题目正文。 */
  question: string;
  /** 创建时冻结 Prompt。 */
  promptVersion: string;
  /** 冻结供应商。 */
  modelProvider: "deepseek" | "openai" | "anthropic";
  /** 冻结模型名。 */
  modelName: string;
  /** 量表版本。 */
  rubricVersion: "rubric-v3";
  /** 本题必须评分的主能力维度。 */
  primaryDimensionKey: string;
  /** 冻结维度。 */
  rubric: FrozenRubricDimension[];
  /** 本题全部候选人消息。 */
  messages: EvaluationCandidateMessage[];
};

/** 原子提交逐题评分的输入。 */
export type CommitQuestionEvaluationInput = {
  /** 冻结上下文。 */
  context: QuestionEvaluationContext;
  /** 已验证证据。 */
  evidence: AnswerEvidenceDraft[];
  /** 已验证并由代码计算总分的评分。 */
  evaluation: QuestionEvaluation;
};

/** 评分提交 receipt。 */
export type QuestionEvaluationReceipt = {
  /** 首次提交时为 true。 */
  committed: boolean;
  /** 重放命中时为 true。 */
  duplicate: boolean;
  /** `evaluate:<questionId>`。 */
  operationKey: string;
  /** 题目 UUID。 */
  questionId: string;
  /** 冻结总分。 */
  overallScore: number;
  /** score_completed 事件序号。 */
  eventSequence: number;
  /** 已保存证据 UUID。 */
  evidenceIds: string[];
};
