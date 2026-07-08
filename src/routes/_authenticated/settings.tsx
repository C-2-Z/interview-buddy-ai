import { createFileRoute } from "@tanstack/react-router";
import { SettingsForm } from "@/features/settings/components/settings-form";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsForm,
});
