/** interview-session - 题目导航 */
import { CheckCircle2 } from "lucide-react";
import type { QuestionItem } from "../types";

export function QuestionNav({
  questions,
  current,
  onChange,
}: {
  questions: QuestionItem[];
  current: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((question, index) => (
        <button
          key={question.id}
          onClick={() => onChange(index)}
          disabled={question.score == null && index > current + 1}
          aria-label={`第 ${index + 1} 题${question.score != null ? "，已评分" : ""}`}
          aria-current={index === current ? "step" : undefined}
          className={`size-11 rounded-xl border text-sm font-medium transition-colors disabled:opacity-30 ${
            index === current
              ? "bg-primary text-primary-foreground border-primary"
              : question.score != null
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card hover:bg-accent"
          }`}
        >
          {question.score != null ? <CheckCircle2 className="mx-auto size-4" /> : index + 1}
        </button>
      ))}
    </div>
  );
}
