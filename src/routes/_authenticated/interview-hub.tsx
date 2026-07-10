import { createFileRoute } from "@tanstack/react-router";
import { InterviewHubPage } from "@/features/interview-hub/components/interview-hub-page";

export const Route = createFileRoute("/_authenticated/interview-hub")({
  component: InterviewHubPage,
});
