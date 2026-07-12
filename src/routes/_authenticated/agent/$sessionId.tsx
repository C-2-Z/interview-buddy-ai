/**
 * Agent 面试会话路由（薄入口）。
 * 恢复现有会话时通过 URL 参数传递 sessionId。
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InterviewAgentPage } from "@/features/interview-agent/components/interview-agent-page";

export const Route = createFileRoute("/_authenticated/agent/$sessionId")({
  parseParams: (params) => ({
    sessionId: z.string().uuid().parse(params.sessionId),
  }),
  component: AgentSessionRoute,
});

function AgentSessionRoute() {
  const { sessionId } = Route.useParams();
  return <InterviewAgentPage sessionId={sessionId} />;
}
