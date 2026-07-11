import { createFileRoute } from "@tanstack/react-router";
import { ResumeDetailPage } from "@/features/resume-library/components/resume-detail-page";

export const Route = createFileRoute("/_authenticated/resumes/$id")({
  component: ResumeDetailRoute,
});

/**
 * 恢复 详述 路由
 * @returns 
 */
function ResumeDetailRoute() {
  return <ResumeDetailPage resumeId={Route.useParams().id} />;
}
