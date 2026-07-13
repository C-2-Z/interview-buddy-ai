/** 双入口首页路由：无 AppShell 的专注页面入口。 */
import { createFileRoute } from "@tanstack/react-router";
import { InterviewHubPage } from "@/features/interview-hub/components/interview-hub-page";

export const Route = createFileRoute("/_focus/interview-hub")({
  component: InterviewHubPage,
});
