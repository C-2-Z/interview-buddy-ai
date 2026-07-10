import { createFileRoute } from "@tanstack/react-router";
import { VoiceCreateForm } from "@/features/voice-interview/components/voice-create-form";

export const Route = createFileRoute("/_authenticated/voice/new")({
  component: VoiceCreateForm,
});
