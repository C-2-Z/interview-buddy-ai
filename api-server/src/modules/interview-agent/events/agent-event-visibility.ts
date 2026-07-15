/** Interview Agent 事件可见性：在服务端统一执行模拟模式过程信息隔离。 */
import type { AgentEvent, AgentExperienceMode } from "../interview-agent.types.js";

/**
 * 判断持久事件是否允许通过实时通道发送给当前会话。
 *
 * @param event - 已提交且完成所有权检查的业务事件。
 * @param experienceMode - 创建时冻结的体验模式。
 * @param productStatus - 会话产品状态；完成后允许查看完整结果。
 * @returns 模拟进行中隐藏活动与逐题评分，其余场景返回 true。
 */
export function shouldExposeAgentEvent(
  event: AgentEvent,
  experienceMode: AgentExperienceMode,
  productStatus: string,
): boolean {
  if (experienceMode !== "simulation" || productStatus === "completed") return true;
  return event.type !== "agent.activity" && event.type !== "agent.score_completed";
}
