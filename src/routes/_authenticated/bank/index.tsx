import { createFileRoute } from "@tanstack/react-router";
import { QuestionBankPage } from "@/features/question-bank/components/question-bank-page";

export const Route = createFileRoute("/_authenticated/bank/")({
  component: QuestionBankPage,
});
