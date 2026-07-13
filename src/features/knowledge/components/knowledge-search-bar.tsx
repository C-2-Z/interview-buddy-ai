/**
 * 知识库：搜索发现条 — 在知识库内搜索文档片段，直接返回 chunks
 */

import { useState, useRef } from "react";
import { Search, X, FileText, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useKnowledgeSearch } from "../hooks/use-knowledge-search";
import type { SearchResult } from "../types";

/** 搜索条组件属性 */
interface KnowledgeSearchBarProps {
  documentIds?: string[];
}

/** 搜索条组件 */
export function KnowledgeSearchBar({ documentIds }: KnowledgeSearchBarProps = {}) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchMutation = useKnowledgeSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = searchMutation.data?.results ?? [];
  const isLoading = searchMutation.isPending;

  /** 执行搜索 */
  function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setShowResults(true);
    searchMutation.mutate({ query: q, topK: 5, documentIds });
  }

  /** 清除搜索 */
  function handleClear() {
    setQuery("");
    setShowResults(false);
    searchMutation.reset();
  }

  /** 高亮搜索关键词 */
  function highlightKeyword(text: string, keyword: string): string {
    if (!keyword.trim()) return text;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark class=\"bg-yellow-200/60 dark:bg-yellow-600/30 rounded px-0.5\">$1</mark>");
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="在知识库中搜索..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) setShowResults(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
            if (e.key === "Escape") handleClear();
          }}
          className="pl-9 pr-8"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* 搜索结果 */}
      {showResults && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-background shadow-lg">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            {isLoading ? "搜索中..." : results.length > 0 ? `找到 ${results.length} 条结果` : "未找到相关结果"}
          </div>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && results.length > 0 && (
            <ScrollArea className="max-h-80">
              <div className="divide-y">
                {results.map((result, i) => (
                  <div key={`${result.chunkId}-${i}`} className="px-3 py-2.5 hover:bg-muted/50">
                    <div className="mb-1 flex items-center gap-2">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs font-medium">{result.documentTitle}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                        {(result.similarity * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <p
                      className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        __html: highlightKeyword(result.content.slice(0, 200), query),
                      }}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
