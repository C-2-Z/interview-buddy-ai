/** 沉浸语音候场路由。 */
import { createFileRoute } from "@tanstack/react-router";
import { ImmersiveVoiceLobby } from "@/features/immersive-voice-interview/components/immersive-voice-lobby";

export const Route = createFileRoute("/_focus/voice/new")({
  component: ImmersiveVoiceLobby,
});
