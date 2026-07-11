import { createFileRoute } from "@tanstack/react-router";
import { InterviewReportPage } from "@/features/interview-history/components/interview-report-page";

export const Route = createFileRoute("/_authenticated/interviews/$id")({
  component: InterviewReportRoute,
});

/**
 * interview report 路由
 * @returns
 */
function InterviewReportRoute() {
  return <InterviewReportPage sessionId={Route.useParams().id} />;
}
