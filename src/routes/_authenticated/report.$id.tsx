/** 报告路由薄入口：把会话参数交给 interview-report feature。 */
import { createFileRoute } from "@tanstack/react-router";
import { InterviewReportPage } from "@/features/interview-report/components/interview-report-page";

export const Route = createFileRoute("/_authenticated/report/$id")({ component: ReportRoute });

/** 渲染可深链接的独立面试报告页。 */
function ReportRoute() {
  const { id } = Route.useParams();
  return <InterviewReportPage sessionId={id} />;
}
