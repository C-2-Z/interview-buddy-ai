/** question-bank - 题库主页面 */
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BankFilters } from "./bank-filters";
import { QuestionCard } from "./question-card";
import { useQuestionBank } from "../hooks/use-question-bank";

/**
 * question bank page
 * @returns 
 */
export function QuestionBankPage() {
  const bank = useQuestionBank();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">面试题库</h1>
          <p className="text-sm text-muted-foreground">浏览精选面试题，自行练习</p>
        </div>
        <Button asChild>
          <Link to="/new">
            <Plus className="w-4 h-4 mr-1" />
            新面试
          </Link>
        </Button>
      </div>

      <BankFilters
        filters={bank.filters}
        onChange={bank.applyFilter}
        onClear={bank.clearFilters}
      />

      {bank.loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : !bank.questions || bank.questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
            暂无匹配的题目，试试调整筛选条件
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {bank.questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              onToggleFavorite={bank.toggleQuestionFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}

