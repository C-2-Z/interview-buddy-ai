import { createFileRoute } from "@tanstack/react-router";
import { VoiceSessionPage } from "@/features/voice-interview/components/voice-session-page";

export const Route = createFileRoute("/_authenticated/voice/session/$id")({
  component: VoiceSessionRoute,
});

function VoiceSessionRoute() {
  const { id } = Route.useParams();
  return <VoiceSessionPage sessionId={id} />;
}
