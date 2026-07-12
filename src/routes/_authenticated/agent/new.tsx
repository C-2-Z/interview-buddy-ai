/**
 * Agent 面试配置路由（薄入口）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { InterviewAgentSetupPage } from "@/features/interview-agent/components/interview-agent-setup";

export const Route = createFileRoute("/_authenticated/agent/new")({
  component: AgentNewRoute,
});

function AgentNewRoute() {
  return <InterviewAgentSetupPage />;
}
