/** Agent 活动文案：把审计原因码转换为不含内部实现术语的用户说明。 */
import type { AgentActivity } from "./types";

const REASON_COPY: Record<string, string> = {
  prepare_context: "读取已选择的岗位、简历、Skill 与研究配置",
  context_prepared: "岗位上下文与首题候选已整理完成",
  initial_strategy: "根据冻结能力蓝图确定本场训练重点",
  score_gap_replan: "根据上一题证据缺口调整后续问题",
  company_context: "补充目标公司和岗位的公开信息",
  brain_context: "仅检索本场明确绑定的知识库",
  memory_context: "仅在你授权后读取聚合训练摘要",
  question_context: "从题库筛选与当前能力维度匹配的候选",
  session_context: "读取本场已经产生的安全上下文引用",
  first_question_commit_failed: "策略与首题候选已经生成，但最终保存未完成，可以安全重试",
};

/** 返回活动的第二行解释；未知原因码不会原样暴露给用户。 */
export function getAgentActivityDetail(activity: AgentActivity): string {
  if (activity.sourceCount !== undefined) {
    return activity.sourceCount > 0
      ? `取得 ${activity.sourceCount} 条可引用信息`
      : activity.status === "skipped"
        ? "当前没有可用资料，已安全跳过"
        : "未取得外部资料，将使用已有上下文继续";
  }
  if (activity.reasonCode && REASON_COPY[activity.reasonCode]) {
    return REASON_COPY[activity.reasonCode];
  }
  if (activity.status === "running") return "这一步完成后会自动进入下一阶段";
  if (activity.status === "failed") return "该步骤失败不会改变题量、评分或结束规则";
  return "已按本场冻结配置执行";
}
