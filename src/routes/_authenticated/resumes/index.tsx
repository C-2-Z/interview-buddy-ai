import { createFileRoute } from "@tanstack/react-router";
import { ResumeLibraryPage } from "@/features/resume-library/components/resume-library-page";

export const Route = createFileRoute("/_authenticated/resumes/")({
  component: ResumeLibraryPage,
});
