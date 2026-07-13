import { createFileRoute } from "@tanstack/react-router";
import { InterviewAgentSetupPage } from "@/features/interview-agent/components/interview-agent-setup";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch:z.object({resumeId:z.string().uuid().optional()}).catch({}),
  component: AgentNewRoute,
});

function AgentNewRoute() {
  return <InterviewAgentSetupPage initialResumeId={Route.useSearch().resumeId} />;
}
