import { createFileRoute } from "@tanstack/react-router";
import { QuestionDetailPage } from "@/features/question-bank/components/question-detail-page";

export const Route = createFileRoute("/_authenticated/bank/$id")({
  component: BankQuestionRoute,
});

function BankQuestionRoute() {
  const { id } = Route.useParams();
  return <QuestionDetailPage questionId={id} />;
}
