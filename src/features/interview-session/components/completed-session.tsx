import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { QuestionItem, SessionDetail } from "../types";

export function CompletedSession({
  session,
  questions,
}: {
  session: SessionDetail;
  questions: QuestionItem[];
}) {
  const newInterviewPath =
    session.interview_mode === "voice" || session.voice_mode ? "/voice/new" : "/new";

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>面试完成</CardTitle>
              <CardDescription>
                {session.position} · {session.difficulty}
              </CardDescription>
            </div>
            <div className="ml-auto text-right">
              <div className="text-3xl font-bold text-primary">
                {session.overall_score ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">综合评分</div>
            </div>
          </div>
        </CardHeader>
        {session.overall_feedback && (
          <CardContent>
            <h3 className="font-semibold mb-2">AI 综合评价</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {session.overall_feedback}
            </p>
          </CardContent>
        )}
      </Card>

      {questions.map((question, index) => (
        <Card key={question.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="outline">第 {index + 1} 题</Badge>
                <CardTitle className="mt-2 text-base">
                  {question.question}
                </CardTitle>
              </div>
              <div className="text-2xl font-bold text-primary">
                {question.score}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                你的回答
              </div>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
                {question.answer}
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                AI 反馈
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {question.feedback}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex gap-2">
        <Button asChild>
          <Link to={newInterviewPath}>再来一次</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/history">查看历史</Link>
        </Button>
      </div>
    </div>
  );
}

