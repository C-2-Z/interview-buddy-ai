import { createFileRoute } from "@tanstack/react-router";
import { InterviewReportPage } from "@/features/interview-history/components/interview-report-page";

export const Route = createFileRoute("/_authenticated/interviews/$id")({
  component: InterviewReportRoute,
});

function InterviewReportRoute() {
  return <InterviewReportPage sessionId={Route.useParams().id} />;
}
