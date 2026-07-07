import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Heart, Search, BookOpen } from "lucide-react";
import { apiClient, type BankQuestion } from "@/lib/api-client";

export const Route = createFileRoute("/_authenticated/bank/")({
  component: BankPage,
});

function BankPage() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");

  const positions = ["前端工程师", "后端工程师", "数据分析师", "产品经理", "全栈工程师", "通用"];
  const difficulties = ["初级", "中级", "高级"];
  const types = ["技术题", "行为题", "场景题", "系统设计"];

  async function load(filters?: { position?: string; difficulty?: string; type?: string; search?: string }) {
    setLoading(true);
    try {
      const data = await apiClient.listBankQuestions(filters);
      setQuestions(data);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleFilterChange(key: string, value: string) {
    const pos = key === "position" ? value : position;
    const diff = key === "difficulty" ? value : difficulty;
    const tp = key === "type" ? value : type;
    const srch = key === "search" ? value : search;

    if (key === "position") setPosition(value);
    if (key === "difficulty") setDifficulty(value);
    if (key === "type") setType(value);
    if (key === "search") setSearch(value);

    const params: Record<string, string> = {};
    if (pos) params.position = pos;
    if (diff) params.difficulty = diff;
    if (tp) params.type = tp;
    if (srch) params.search = srch;

    load(Object.keys(params).length ? params : undefined);
  }

  async function toggleFav(q: BankQuestion) {
    try {
      await apiClient.toggleFavorite(q.id);
      setQuestions((prev) =>
        prev?.map((item) =>
          item.id === q.id ? { ...item, is_favorited: !item.is_favorited } : item,
        ) ?? null,
      );
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">面试题库</h1>
        <p className="text-sm text-muted-foreground">浏览精选面试题，自行练习</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={position} onValueChange={(v) => handleFilterChange("position", v === position ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="全部岗位" /></SelectTrigger>
          <SelectContent>
            {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={(v) => handleFilterChange("difficulty", v === difficulty ? "" : v)}>
          <SelectTrigger className="w-28"><SelectValue placeholder="全部难度" /></SelectTrigger>
          <SelectContent>
            {difficulties.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => handleFilterChange("type", v === type ? "" : v)}>
          <SelectTrigger className="w-28"><SelectValue placeholder="全部类型" /></SelectTrigger>
          <SelectContent>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索题目..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFilterChange("search", search);
            }}
            className="pl-8"
          />
        </div>
        {(position || difficulty || type || search) && (
          <Button variant="ghost" size="sm" onClick={() => {
            setPosition(""); setDifficulty(""); setType(""); setSearch("");
            load();
          }}>
            清除筛选
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !questions || questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
            暂无匹配的题目，试试调整筛选条件
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {questions.map((q) => (
            <Link key={q.id} to="/bank/$id" params={{ id: q.id }}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">{q.position}</Badge>
                        <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
                        <Badge variant="outline" className="text-xs">{q.type}</Badge>
                      </div>
                      <CardTitle className="text-sm font-medium leading-relaxed line-clamp-2">
                        {q.question}
                      </CardTitle>
                      {q.tags && q.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {q.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
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
                        toggleFav(q);
                      }}
                    >
                      <Heart className={`w-4 h-4 ${q.is_favorited ? "fill-red-500 text-red-500" : ""}`} />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
