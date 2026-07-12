/** Interview Agent 确定性能力蓝图与角色-维度题目编排。 */
import type { SkillDef } from "../../skills/skill.types.js";
import type {
  AgentMode,
  RoleId,
  RoleStage,
} from "../interview-agent.types.js";
import type {
  CapabilityBlueprint,
  CapabilityDimension,
} from "./preparation.types.js";

/** 通用维度在任何岗位都必须进入冻结量表。 */
const UNIVERSAL_CAPABILITIES: ReadonlyArray<
  Omit<CapabilityDimension, "targetQuestionCount">
> = [
  {
    key: "COMMUNICATION",
    label: "沟通表达",
    source: "universal",
    weight: 2,
    evidenceHints: ["回答结构", "术语准确性", "事实与结论的连接"],
  },
  {
    key: "LOGICAL_THINKING",
    label: "逻辑思维",
    source: "universal",
    weight: 2,
    evidenceHints: ["推理步骤", "因果关系", "边界条件"],
  },
  {
    key: "PROBLEM_SOLVING",
    label: "问题解决",
    source: "universal",
    weight: 2,
    evidenceHints: ["方案比较", "行动过程", "结果与复盘"],
  },
];

/** 面板角色的职责维度不会改变题量，只约束各阶段应收集的证据。 */
const ROLE_CAPABILITIES: ReadonlyArray<
  Omit<CapabilityDimension, "targetQuestionCount">
> = [
  {
    key: "TECHNICAL_DEPTH",
    label: "技术深度",
    source: "role",
    weight: 3,
    evidenceHints: ["实现细节", "系统权衡", "故障或性能证据"],
  },
  {
    key: "BUSINESS_JUDGMENT",
    label: "业务判断",
    source: "role",
    weight: 2,
    evidenceHints: ["优先级依据", "风险取舍", "业务结果"],
  },
  {
    key: "MOTIVATION_FIT",
    label: "动机与匹配",
    source: "role",
    weight: 1.5,
    evidenceHints: ["求职动机", "职业规划", "行为一致性"],
  },
];

/** Skill priority 到蓝图权重的固定映射。 */
const SKILL_PRIORITY_WEIGHT = {
  CORE: 4,
  NORMAL: 2.5,
  ALWAYS_ONE: 3,
} as const;

/** 角色允许覆盖的固定维度集合；Skill 维度只由技术或综合角色使用。 */
const ROLE_DIMENSION_KEYS: Readonly<Record<RoleId, ReadonlySet<string>>> = {
  general: new Set(),
  technical: new Set([
    "TECHNICAL_DEPTH",
    "LOGICAL_THINKING",
    "PROBLEM_SOLVING",
    "COMMUNICATION",
  ]),
  manager: new Set([
    "BUSINESS_JUDGMENT",
    "PROBLEM_SOLVING",
    "LOGICAL_THINKING",
    "COMMUNICATION",
  ]),
  hr: new Set(["MOTIVATION_FIT", "COMMUNICATION"]),
};

/**
 * 将 Skill 分类转换为冻结专业维度，排除只用于简历追问的 PROJECT 占位分类。
 *
 * @param skill - 可选岗位 Skill。
 * @returns 保持 Skill 配置顺序的专业维度。
 */
function skillCapabilities(
  skill: SkillDef | null,
): Array<Omit<CapabilityDimension, "targetQuestionCount">> {
  return (skill?.categories ?? [])
    .filter((category) => category.key !== "PROJECT")
    .map((category) => ({
      key: category.key,
      label: category.label,
      source: "skill" as const,
      weight: SKILL_PRIORITY_WEIGHT[category.priority],
      evidenceHints: [
        `${category.label}原理`,
        `${category.label}实践细节`,
        `${category.label}取舍与边界`,
      ],
    }));
}

/**
 * 合并并按 key 去重通用、Skill 和角色维度。
 *
 * @param skill - 可选岗位 Skill。
 * @returns 稳定顺序的维度定义。
 */
function dimensionDefinitions(
  skill: SkillDef | null,
): Array<Omit<CapabilityDimension, "targetQuestionCount">> {
  const seen = new Set<string>();
  return [
    ...skillCapabilities(skill),
    ...UNIVERSAL_CAPABILITIES,
    ...ROLE_CAPABILITIES,
  ].filter((dimension) => {
    if (seen.has(dimension.key)) return false;
    seen.add(dimension.key);
    return true;
  });
}

/**
 * 判断某角色是否允许把指定维度作为题目的主要目标。
 *
 * @param roleId - 当前固定角色。
 * @param dimension - 候选维度。
 * @returns general 接受全部；technical 额外接受所有 Skill 维度。
 */
function roleAllowsDimension(
  roleId: RoleId,
  dimension: Omit<CapabilityDimension, "targetQuestionCount">,
): boolean {
  if (roleId === "general") return true;
  if (roleId === "technical" && dimension.source === "skill") return true;
  return ROLE_DIMENSION_KEYS[roleId].has(dimension.key);
}

/**
 * 返回角色第一题优先覆盖的职责维度。
 *
 * @param roleId - 当前角色。
 * @param eligible - 当前角色允许的维度。
 * @returns 首题维度；技术角色优先 Skill 核心维度。
 */
function preferredFirstDimension(
  roleId: RoleId,
  eligible: Array<Omit<CapabilityDimension, "targetQuestionCount">>,
): Omit<CapabilityDimension, "targetQuestionCount"> {
  if (roleId === "technical") {
    return (
      eligible.find((dimension) => dimension.source === "skill") ??
      eligible.find((dimension) => dimension.key === "TECHNICAL_DEPTH") ??
      eligible[0]
    );
  }
  const preferredKey =
    roleId === "manager"
      ? "BUSINESS_JUDGMENT"
      : roleId === "hr"
        ? "MOTIVATION_FIT"
        : null;
  return (
    eligible.find((dimension) => dimension.key === preferredKey) ?? eligible[0]
  );
}

/**
 * 使用加权公平队列为角色阶段选择下一个维度。
 *
 * @param eligible - 当前角色允许的维度。
 * @param assigned - 全场已经分配到每个维度的题数。
 * @returns `(assigned + 1) / weight` 最小的稳定维度。
 */
function nextWeightedDimension(
  eligible: Array<Omit<CapabilityDimension, "targetQuestionCount">>,
  assigned: ReadonlyMap<string, number>,
): Omit<CapabilityDimension, "targetQuestionCount"> {
  return [...eligible].sort((left, right) => {
    const leftLoad = ((assigned.get(left.key) ?? 0) + 1) / left.weight;
    const rightLoad = ((assigned.get(right.key) ?? 0) + 1) / right.weight;
    return rightLoad - leftLoad === 0
      ? left.key.localeCompare(right.key)
      : leftLoad - rightLoad;
  })[0];
}

/** 角色和能力维度对每道题的确定性映射。 */
export type QuestionCapabilityPlan = {
  /** 题目索引对应角色。 */
  questionRoles: RoleId[];
  /** 题目索引对应主维度。 */
  questionDimensions: string[];
};

/**
 * 按固定角色阶段生成每题角色与主能力维度。
 *
 * @param rolePlan - 已冻结角色阶段计划。
 * @param definitions - 稳定顺序的维度定义。
 * @returns 与总题数等长的角色和维度数组。
 */
function assignQuestions(
  rolePlan: RoleStage[],
  definitions: Array<Omit<CapabilityDimension, "targetQuestionCount">>,
): QuestionCapabilityPlan {
  const assigned = new Map<string, number>();
  const questionRoles: RoleId[] = [];
  const questionDimensions: string[] = [];

  for (const stage of rolePlan) {
    const eligible = definitions.filter((dimension) =>
      roleAllowsDimension(stage.roleId, dimension),
    );
    if (eligible.length === 0) {
      throw new Error(`No capability dimension is available for ${stage.roleId}`);
    }

    for (let offset = 0; offset < stage.questionCount; offset += 1) {
      const selected =
        offset === 0
          ? preferredFirstDimension(stage.roleId, eligible)
          : nextWeightedDimension(eligible, assigned);
      questionRoles.push(stage.roleId);
      questionDimensions.push(selected.key);
      assigned.set(selected.key, (assigned.get(selected.key) ?? 0) + 1);
    }
  }
  return { questionRoles, questionDimensions };
}

/**
 * 构建能力蓝图并把每道题绑定到固定角色和主要维度。
 *
 * @param params - Agent 模式、题数、角色计划和可选 Skill。
 * @returns 冻结蓝图与题目级角色/维度映射。
 */
export function buildCapabilityBlueprint(params: {
  mode: AgentMode;
  questionCount: number;
  rolePlan: RoleStage[];
  skill: SkillDef | null;
}): CapabilityBlueprint & QuestionCapabilityPlan {
  const plannedCount = params.rolePlan.reduce(
    (sum, stage) => sum + stage.questionCount,
    0,
  );
  if (
    !Number.isInteger(params.questionCount) ||
    params.questionCount < 3 ||
    params.questionCount > 10 ||
    plannedCount !== params.questionCount
  ) {
    throw new RangeError("Role plan must cover exactly 3 to 10 questions");
  }
  if (
    (params.mode === "single" && params.rolePlan.some((stage) => stage.roleId !== "general")) ||
    (params.mode === "panel" && params.rolePlan.some((stage) => stage.roleId === "general"))
  ) {
    throw new Error("Role plan does not match the Agent mode");
  }

  const definitions = dimensionDefinitions(params.skill);
  const questionPlan = assignQuestions(params.rolePlan, definitions);
  const counts = new Map<string, number>();
  for (const key of questionPlan.questionDimensions) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dimensions = definitions.map((definition) => ({
    ...definition,
    targetQuestionCount: counts.get(definition.key) ?? 0,
  }));

  return {
    version: "capability-v1",
    questionCount: params.questionCount,
    dimensions,
    ...questionPlan,
  };
}
