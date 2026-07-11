/** question-bank - 题库题目卡片 */
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BankQuestion } from "../types";

/**
 * question card
 * @returns
 */
export function QuestionCard({
  question,
  onToggleFavorite,
}: {
  question: BankQuestion;
  onToggleFavorite: (question: BankQuestion) => void;
}) {
  return (
    <Link to="/bank/$id" params={{ id: question.id }}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  {question.position}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {question.difficulty}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {question.type}
                </Badge>
              </div>
              <CardTitle className="text-sm font-medium leading-relaxed line-clamp-2">
                {question.question}
              </CardTitle>
              {question.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {question.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(question);
              }}
            >
              <Heart
                className={`w-4 h-4 ${
                  question.is_favorited ? "fill-red-500 text-red-500" : ""
                }`}
              />
            </Button>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

