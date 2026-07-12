/** Interview Agent 固定 Persona 与确定性角色题数分配。 */
import type {
  AgentMode,
  RoleId,
  RolePersona,
  RoleStage,
} from "../interview-agent.types.js";

/** 面板模式固定接力顺序。 */
export const PANEL_ROLE_ORDER = ["technical", "manager", "hr"] as const;

/** 面板模式在基础一题之外的剩余题目权重。 */
const PANEL_ROLE_WEIGHTS: Readonly<Record<(typeof PANEL_ROLE_ORDER)[number], number>> = {
  technical: 0.6,
  manager: 0.25,
  hr: 0.15,
};

/** v1 固定 Persona；Persona 只能约束风格和范围，不控制题量或结束条件。 */
export const ROLE_PERSONAS = {
  general: {
    id: "general",
    displayName: "综合面试官",
    goals: ["覆盖岗位核心能力", "围绕候选人回答获取可验证证据", "保持完整且连贯的面试体验"],
    tone: "专业、克制、友好，每轮只提出一个清晰问题。",
    allowedTopics: ["岗位技能", "项目经历", "业务场景", "协作沟通", "职业动机"],
    prohibitedBehaviors: ["替候选人作答", "泄露评分或参考答案", "改变题数、追问上限或结束条件"],
    rubricOverrides: {},
    promptVersion: "agent-v1-general",
  },
  technical: {
    id: "technical",
    displayName: "技术面试官",
    goals: ["验证技术深度与实现能力", "追问项目证据和系统权衡", "识别边界条件与风险意识"],
    tone: "严谨、具体、循序深入，优先追问可验证的实现细节。",
    allowedTopics: ["技术原理", "项目实现", "系统设计", "故障排查", "性能与安全权衡"],
    prohibitedBehaviors: ["询问与岗位无关的私人信息", "直接给出技术答案", "越过固定角色阶段"],
    rubricOverrides: { technical_depth: 1.2 },
    promptVersion: "agent-v1-technical",
  },
  manager: {
    id: "manager",
    displayName: "主管面试官",
    goals: ["验证业务判断和优先级能力", "评估协作、决策和交付过程", "识别风险管理与复盘能力"],
    tone: "务实、场景化，关注候选人采取行动的原因和业务结果。",
    allowedTopics: ["业务场景", "优先级取舍", "跨团队协作", "项目风险", "复盘与改进"],
    prohibitedBehaviors: ["深入考查超出角色范围的技术细节", "替候选人构造经历", "改变全局流程规则"],
    rubricOverrides: { business_judgment: 1.15 },
    promptVersion: "agent-v1-manager",
  },
  hr: {
    id: "hr",
    displayName: "HR 面试官",
    goals: ["了解求职动机和职业规划", "评估沟通方式与价值观匹配", "验证行为经历的一致性"],
    tone: "尊重、开放、非诱导，使用行为问题获取具体事实。",
    allowedTopics: ["求职动机", "行为经历", "沟通协作", "职业规划", "工作偏好"],
    prohibitedBehaviors: ["询问受保护的敏感个人信息", "作出录用承诺", "讨论未授权的薪酬结论"],
    rubricOverrides: { communication: 1.1 },
    promptVersion: "agent-v1-hr",
  },
} satisfies Record<RoleId, RolePersona>;

/**
 * 返回指定角色的固定 Persona。
 *
 * @param roleId - 需要加载的角色标识。
 * @returns 与角色标识一一对应的 v1 Persona。
 */
export function getRolePersona(roleId: RoleId): RolePersona {
  return ROLE_PERSONAS[roleId];
}

/**
 * 使用最大余数法分配三名面试官基础题之外的剩余题目。
 *
 * @param remainingQuestions - 三个角色各获得一题后仍需分配的题数。
 * @returns 按 technical、manager、hr 顺序排列的额外题数。
 */
function allocatePanelRemainder(remainingQuestions: number): number[] {
  const quotas = PANEL_ROLE_ORDER.map(
    (roleId) => remainingQuestions * PANEL_ROLE_WEIGHTS[roleId],
  );
  const allocation = quotas.map((quota) => Math.floor(quota));
  const allocated = allocation.reduce((sum, count) => sum + count, 0);
  const seatsLeft = remainingQuestions - allocated;

  // 小数余数相同时保持固定角色顺序，确保相同配置在重放时产生完全相同的计划。
  const remainderRanking = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < seatsLeft; index += 1) {
    allocation[remainderRanking[index].index] += 1;
  }
  return allocation;
}

/**
 * 构建冻结的角色阶段计划。
 *
 * single 模式由 general 负责全部题目；panel 模式先给三个角色各一题，再按
 * 60% / 25% / 15% 最大余数法分配剩余题目，并固定按技术、主管、HR 接力。
 *
 * @param mode - 单面试官或多角色面板模式。
 * @param questionCount - 本场题目总数，必须为 3–10 的整数。
 * @returns 包含角色顺序、题数和全局题目索引范围的阶段计划。
 */
export function buildRolePlan(mode: AgentMode, questionCount: number): RoleStage[] {
  if (!Number.isInteger(questionCount) || questionCount < 3 || questionCount > 10) {
    throw new RangeError("questionCount must be an integer between 3 and 10");
  }

  if (mode === "single") {
    return [
      {
        stageIndex: 0,
        roleId: "general",
        questionCount,
        startQuestionIndex: 0,
        endQuestionIndex: questionCount - 1,
      },
    ];
  }

  const extraAllocation = allocatePanelRemainder(questionCount - PANEL_ROLE_ORDER.length);
  let nextQuestionIndex = 0;
  return PANEL_ROLE_ORDER.map((roleId, stageIndex) => {
    const roleQuestionCount = 1 + extraAllocation[stageIndex];
    const stage: RoleStage = {
      stageIndex,
      roleId,
      questionCount: roleQuestionCount,
      startQuestionIndex: nextQuestionIndex,
      endQuestionIndex: nextQuestionIndex + roleQuestionCount - 1,
    };
    nextQuestionIndex += roleQuestionCount;
    return stage;
  });
}
