/** 双入口首页路由：使用认证 AppShell 保留桌面左侧栏与移动端导航。 */
import { createFileRoute } from "@tanstack/react-router";
import { InterviewHubPage } from "@/features/interview-hub/components/interview-hub-page";

export const Route = createFileRoute("/_authenticated/interview-hub")({
  component: InterviewHubPage,
});
