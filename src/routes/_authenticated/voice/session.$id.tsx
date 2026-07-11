import { createFileRoute } from "@tanstack/react-router";
import { VoiceSessionPage } from "@/features/voice-interview/components/voice-session-page";

export const Route = createFileRoute("/_authenticated/voice/session/$id")({
  component: VoiceSessionRoute,
});

/**
 * voice session 路由
 * @returns
 */
function VoiceSessionRoute() {
  const { id } = Route.useParams();
  return <VoiceSessionPage sessionId={id} />;
}
