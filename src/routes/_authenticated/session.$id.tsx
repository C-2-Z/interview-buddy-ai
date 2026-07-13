import { createFileRoute } from "@tanstack/react-router";
import { InterviewAgentPage } from "@/features/interview-agent/components/interview-agent-page";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/session/$id")({
  validateSearch: z.object({ fallback: z.literal("text").optional() }).catch({}),
  component: AgentSessionRoute,
});

function AgentSessionRoute() {
  const { id } = Route.useParams();
  return (
    <InterviewAgentPage
      sessionId={id}
      allowVoiceTextFallback={Route.useSearch().fallback === "text"}
    />
  );
}
