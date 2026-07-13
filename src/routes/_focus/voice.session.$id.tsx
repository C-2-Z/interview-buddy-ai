/** 沉浸语音会话路由。 */
import { createFileRoute } from "@tanstack/react-router";
import { ImmersiveVoiceRoom } from "@/features/immersive-voice-interview/components/immersive-voice-room";

export const Route = createFileRoute("/_focus/voice/session/$id")({
  component: VoiceSessionRoute,
});

// 路由只解析 UUID 参数并委托沉浸语音 feature。
function VoiceSessionRoute() {
  return <ImmersiveVoiceRoom sessionId={Route.useParams().id} />;
}
