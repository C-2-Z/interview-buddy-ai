import { createFileRoute } from "@tanstack/react-router";
import { InterviewHistoryPage } from "@/features/interview-history/components/interview-history-page";

export const Route = createFileRoute("/_authenticated/interviews/")({
  component: InterviewHistoryPage,
});
