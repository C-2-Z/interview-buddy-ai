import { createFileRoute } from "@tanstack/react-router";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { ProfileForm } from "@/features/profile/components/profile-form";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => <div className="mx-auto max-w-2xl space-y-6"><ProfileForm /><SettingsForm /></div>,
});
