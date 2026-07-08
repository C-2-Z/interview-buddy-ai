import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessages } from "./chat-messages";
import type { Message, QuestionItem } from "../types";

export function QuestionResult({
  question,
  messages,
  canGoNext,
  allAnswered,
  finishing,
  onNext,
  onFinish,
}: {
  question: QuestionItem;
  messages: Message[];
  canGoNext: boolean;
  allAnswered: boolean;
  finishing: boolean;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-4">
      <ChatMessages messages={messages} />
      <div className="rounded-lg border bg-primary/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">AI 评分与反馈</div>
          <div className="text-2xl font-bold text-primary">{question.score}</div>
        </div>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {question.feedback}
        </p>
      </div>
      <div className="flex gap-2">
        {canGoNext && (
          <Button onClick={onNext}>
            下一题 <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
        {allAnswered && (
          <Button onClick={onFinish} disabled={finishing}>
            {finishing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                总结中…
              </>
            ) : (
              "完成面试并生成总结"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

