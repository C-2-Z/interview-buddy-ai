/** question-bank - 题库题目详情页 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  getBankQuestion,
  toggleFavorite,
} from "../api";
import type { BankQuestion } from "../types";

/**
 * question 详述 page
 *
 * @param questionId -
 * @returns
 */
export function QuestionDetailPage({ questionId }: { questionId: string }) {
  const [question, setQuestion] = useState<BankQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBankQuestion(questionId)
      .then(setQuestion)
      .catch(() => toast.error("加载失败"))
      .finally(() => setLoading(false));
  }, [questionId]);

  /**
   * 处理 切换 favorite
   * @returns Promise<
   */
  async function handleToggleFavorite() {
    if (!question) return;
    try {
      const result = await toggleFavorite(question.id);
      setQuestion((prev) =>
        prev ? { ...prev, is_favorited: result.is_favorited } : null,
      );
      toast.success(result.is_favorited ? "已收藏" : "已取消收藏");
    } catch {
      toast.error("操作失败");
    }
  }

  /**
   * 保存 practice answer
   * @returns
   */
  function savePracticeAnswer() {
    if (!question) return;
    setSaving(true);
    try {
      localStorage.setItem(`practice_${question.id}`, answer);
      toast.success("回答已保存到本地");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!question) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          题目未找到
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/bank">
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回题库
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{question.position}</Badge>
                <Badge variant="outline">{question.difficulty}</Badge>
                <Badge variant="outline">{question.type}</Badge>
              </div>
              <CardTitle className="text-lg leading-relaxed">
                {question.question}
              </CardTitle>
              {question.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {question.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs text-muted-foreground bg-muted rounded px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={handleToggleFavorite}>
              <Heart
                className={`w-5 h-5 ${
                  question.is_favorited ? "fill-red-500 text-red-500" : ""
                }`}
              />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            练习模式
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            在下方写下你的回答，练习面试表达。完成后可以对照自己的思路进行复盘。
          </p>
          <Textarea
            placeholder="写下你的回答..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={8}
            maxLength={5000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {answer.length}/5000
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!answer.trim() || saving}
              onClick={savePracticeAnswer}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存回答"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

