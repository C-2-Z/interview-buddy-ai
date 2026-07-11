import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InterviewSetupPage } from "@/features/interview-setup/components/interview-setup-page";

const setupSearchSchema = z.object({
  resumeId: z.string().uuid().optional(),
  sourceSessionId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/voice/new")({
  validateSearch: setupSearchSchema,
  component: VoiceInterviewSetupRoute,
});

/**
 * voice interview setup 路由
 * @returns 
 */
function VoiceInterviewSetupRoute() {
  return <InterviewSetupPage mode="voice" search={Route.useSearch()} />;
}
