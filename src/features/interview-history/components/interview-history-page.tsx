import { Link } from "@tanstack/react-router";
import { FileSearch, Keyboard, Mic2, RotateCw, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useInterviewHistory } from "../hooks/use-interview-history";
import { isVoiceSession, type InterviewHistoryItem } from "../types";

function InterviewActions({ item }: { item: InterviewHistoryItem }) {
  if (item.status === "completed") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="min-h-10" asChild>
          <Link to="/interviews/$id" params={{ id: item.id }}>
            查看报告
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="min-h-10" asChild>
          {isVoiceSession(item) ? (
            <Link to="/voice/new" search={{ sourceSessionId: item.id }}>
              再来一次
            </Link>
          ) : (
            <Link to="/new" search={{ sourceSessionId: item.id }}>
              再来一次
            </Link>
          )}
        </Button>
      </div>
    );
  }
  return isVoiceSession(item) ? (
    <Button size="sm" className="min-h-10" asChild>
      <Link to="/voice/session/$id" params={{ id: item.id }}>
        继续面试
      </Link>
    </Button>
  ) : (
    <Button size="sm" className="min-h-10" asChild>
      <Link to="/session/$id" params={{ id: item.id }}>
        继续面试
      </Link>
    </Button>
  );
}

export function InterviewHistoryPage() {
  const history = useInterviewHistory();
  const hasFilters = Object.values(history.filters).some(
    (value) => value !== "" && value !== "all",
  );

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">面试记录</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          查看文本与语音面试进度，回顾每一道题的回答和反馈。
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-3 py-4 md:grid-cols-[minmax(220px,1fr)_160px_160px_140px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="按岗位搜索"
              placeholder="按岗位搜索"
              className="min-h-11 pl-9 text-base"
              value={history.filters.query}
              onChange={(event) => history.setFilter("query", event.target.value)}
            />
          </div>
          <Select
            value={history.filters.mode}
            onValueChange={(value) =>
              history.setFilter("mode", value as typeof history.filters.mode)
            }
          >
            <SelectTrigger className="min-h-11" aria-label="筛选面试类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="text">文本面试</SelectItem>
              <SelectItem value="voice">语音面试</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={history.filters.status}
            onValueChange={(value) =>
              history.setFilter("status", value as typeof history.filters.status)
            }
          >
            <SelectTrigger className="min-h-11" aria-label="筛选完成状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">进行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={history.filters.difficulty}
            onValueChange={(value) =>
              history.setFilter("difficulty", value as typeof history.filters.difficulty)
            }
          >
            <SelectTrigger className="min-h-11" aria-label="筛选难度">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部难度</SelectItem>
              <SelectItem value="初级">初级</SelectItem>
              <SelectItem value="中级">中级</SelectItem>
              <SelectItem value="高级">高级</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {history.loading ? (
        <div className="space-y-3" aria-label="正在加载面试记录">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : history.error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{history.error}</p>
            <Button variant="outline" onClick={() => void history.refresh()}>
              <RotateCw />
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : history.filteredItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FileSearch className="size-9 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">
              {history.items.length ? "没有符合条件的记录" : "还没有面试记录"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {history.items.length
                ? "尝试调整搜索或筛选条件。"
                : "完成第一次练习后，记录和报告会显示在这里。"}
            </p>
            {hasFilters ? (
              <Button variant="outline" className="mt-5" onClick={history.resetFilters}>
                <SlidersHorizontal />
                清除筛选
              </Button>
            ) : (
              <Button className="mt-5" asChild>
                <Link to="/interview-hub">前往面试中心</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {history.filteredItems.map((item) => (
            <Card key={item.id} className="border-border/80">
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  {isVoiceSession(item) ? <Mic2 /> : <Keyboard />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.position}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{isVoiceSession(item) ? "语音" : "文本"}</Badge>
                    <Badge variant="outline">{item.difficulty}</Badge>
                    <Badge variant={item.status === "completed" ? "default" : "secondary"}>
                      {item.status === "completed" ? "已完成" : "进行中"}
                    </Badge>
                    <span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
                {item.overall_score != null && (
                  <div className="sm:text-right">
                    <div className="text-2xl font-bold tabular-nums text-primary">
                      {item.overall_score}
                    </div>
                    <div className="text-xs text-muted-foreground">综合评分</div>
                  </div>
                )}
                <InterviewActions item={item} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
