import { createFileRoute } from "@tanstack/react-router";
import { CreateInterviewForm } from "@/features/interview-create/components/create-interview-form";

export const Route = createFileRoute("/_authenticated/new")({
  component: CreateInterviewForm,
});
