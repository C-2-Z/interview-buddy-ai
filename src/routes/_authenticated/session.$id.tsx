import { createFileRoute } from "@tanstack/react-router";
import { InterviewSessionPage } from "@/features/interview-session/components/interview-session-page";

export const Route = createFileRoute("/_authenticated/session/$id")({
  component: SessionRoute,
});

/**
 * session 路由
 * @returns 
 */
function SessionRoute() {
  const { id } = Route.useParams();
  return <InterviewSessionPage sessionId={id} />;
}
