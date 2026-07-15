/** Interview Agent Phase 2 研究、能力蓝图和动态选题的公共类型。 */
import type {
  AgentDifficulty,
  RoleId,
  RoleStage,
} from "../interview-agent.types.js";

/** 准备阶段的三类固定研究查询。 */
export type ResearchCategory = "company" | "role" | "industry";

/** 传给项目内搜索 Provider 的受控查询。 */
export type WebSearchQuery = {
  /** 由代码模板构造的查询文本。 */
  query: string;
  /** 返回条数，Agent 3 每类最多五条。 */
  maxResults: number;
  /** 可选域名 allowlist。 */
  includeDomains?: string[];
  /** 可选域名 denylist。 */
  excludeDomains?: string[];
};

/** 经清洗、限长和哈希后才能进入业务表的搜索结果。 */
export type WebSearchResult = {
  /** 网页标题，已经移除 HTML 和控制字符。 */
  title: string;
  /** 规范化的 HTTP(S) 来源地址。 */
  url: string;
  /** 最多 2,000 字符的不可信网页摘要。 */
  snippet: string;
  /** 搜索完成的 ISO 8601 时间。 */
  fetchedAt: string;
  /** 标题、URL 与摘要的 SHA-256，用于去重和缓存。 */
  contentHash: string;
};

/** 保存到会话研究附录的一条来源。 */
export type AgentResearchSource = WebSearchResult & {
  /** 来源所属固定研究类别。 */
  category: ResearchCategory;
  /** 产生该来源的代码构造查询。 */
  query: string;
};

/** 从业务简历记录生成的有限摘要；完整文件和 parsed_text 不进入 State。 */
export type AgentResumeSummary = {
  /** 简历记录 UUID。 */
  resumeId: string;
  /** 最多五十个规范技能名称。 */
  skills: string[];
  /** 有限工作经历角色摘要。 */
  roles: string[];
  /** 有限项目名称和技术栈摘要。 */
  projects: string[];
  /** 最多 500 字的既有综合分析。 */
  overallAssessment: string | null;
};

/** 能力维度来源，决定蓝图的解释方式而不改变流程控制。 */
export type CapabilityDimensionSource =
  | "universal"
  | "skill"
  | "role";

/** 本场面试需要覆盖的一个能力维度。 */
export type CapabilityDimension = {
  /** 冻结量表使用的稳定维度键。 */
  key: string;
  /** 前端和报告展示名称。 */
  label: string;
  /** 维度由通用量表、Skill 或角色规则提供。 */
  source: CapabilityDimensionSource;
  /** 确定性题量分配使用的相对权重。 */
  weight: number;
  /** 该维度在本场至少作为主维度出现的题数。 */
  targetQuestionCount: number;
  /** 后续证据提取需要寻找的事实类型。 */
  evidenceHints: string[];
};

/** 创建时冻结的完整能力覆盖蓝图。 */
export type CapabilityBlueprint = {
  /** 蓝图算法版本。 */
  version: "capability-v1";
  /** 所有目标题数之和。 */
  questionCount: number;
  /** 按确定性优先级排列的维度。 */
  dimensions: CapabilityDimension[];
};

/** 题库或模型提供的候选题。 */
export type AgentQuestionCandidate = {
  /** 题库 UUID 或模型生成的稳定 ID。 */
  id: string;
  /** 候选题正文。 */
  question: string;
  /** 题目岗位标签。 */
  position: string;
  /** 题目难度。 */
  difficulty: AgentDifficulty;
  /** 题型或来源分类。 */
  type: string;
  /** 搜索和能力匹配标签。 */
  tags: string[];
  /** 允许使用该题的面试官角色。 */ roleIds: RoleId[];
  /** 该题可作为主评分维度的键。 */ dimensionKeys: string[];
  /** 用于与 Planner 意图做相关性匹配的主题键。 */ topicKeys: string[];
  /** 该题天然适合收集的事实证据目标。 */ evidenceGoalKeys: string[];
  /** 优先使用题库，模型只作兜底。 */
  source: "bank" | "model";
};

/** 准备阶段交给后续 Graph 的冻结计划。 */
export type PreparedInterviewPlan = {
  /** 计划结构版本。 */
  version: "plan-v3";
  /** 固定角色顺序与题量。 */
  rolePlan: RoleStage[];
  /** 冻结能力维度及目标题量。 */
  capabilityBlueprint: CapabilityBlueprint;
  /** 每个题目索引对应的角色。 */
  questionRoles: RoleId[];
  /** 每个题目索引对应的主维度键。 */
  questionDimensions: string[];
  /** 每题冻结的实际评分维度。 */
  questionApplicableDimensions: string[][];
  /** 每题冻结的证据目标。 */
  questionEvidenceGoals: string[][];
  /** 已选首题；没有题库命中时由模型兜底。 */
  firstQuestion: AgentQuestionCandidate;
  /** 是否成功使用了联网来源。 */
  researchStatus: "completed" | "skipped" | "failed";
  /** 报告附录使用的已清洗来源。 */
  researchSources: AgentResearchSource[];
};
