import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InterviewSetupPage } from "@/features/interview-setup/components/interview-setup-page";

const setupSearchSchema = z.object({
  resumeId: z.string().uuid().optional(),
  sourceSessionId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: setupSearchSchema,
  component: TextInterviewSetupRoute,
});

function TextInterviewSetupRoute() {
  return <InterviewSetupPage mode="text" search={Route.useSearch()} />;
}
