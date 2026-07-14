/** Agent Orchestration 前端契约：只呈现策略摘要和可审计行动。 */
import type { AgentActivity, AgentStrategyView } from "@/features/interview-agent/types";

export type { AgentActivity, AgentStrategyView };

/** 活动列表接口响应。 */
export type AgentActivitiesResponse = Readonly<{ activities: AgentActivity[] }>;
