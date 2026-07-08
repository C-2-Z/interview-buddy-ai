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
    <div className="flex gap-2 flex-wrap">
      {questions.map((question, index) => (
        <button
          key={question.id}
          onClick={() => onChange(index)}
          disabled={question.score == null && index > current + 1}
          className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors disabled:opacity-30 ${
            index === current
              ? "bg-primary text-primary-foreground border-primary"
              : question.score != null
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card hover:bg-accent"
          }`}
        >
          {question.score != null ? (
            <CheckCircle2 className="w-4 h-4 mx-auto" />
          ) : (
            index + 1
          )}
        </button>
      ))}
    </div>
  );
}

