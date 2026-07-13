import { createFileRoute } from "@tanstack/react-router";
import { InterviewAgentPage } from "@/features/interview-agent/components/interview-agent-page";

export const Route = createFileRoute("/_authenticated/session/$id")({
  component: AgentSessionRoute,
});

function AgentSessionRoute() {
  const { id } = Route.useParams();
  return <InterviewAgentPage sessionId={id} />;
}
