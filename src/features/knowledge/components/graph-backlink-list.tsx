/** 知识图谱模块：反链列表组件（谁链接到了当前节点） */

import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BacklinkDetail } from "../types";

/** 反链列表属性 */
interface GraphBacklinkListProps {
  backlinks: BacklinkDetail[] | undefined;
  isLoading: boolean;
  chunkLabel: string;
  onBack: () => void;
  onNavigateToChunk: (chunkId: string) => void;
}

/** 反链列表面板 */
export function GraphBacklinkList({
  backlinks,
  isLoading,
  chunkLabel,
  onBack,
  onNavigateToChunk,
}: GraphBacklinkListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h4 className="truncate text-sm font-medium">{chunkLabel}</h4>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !backlinks || backlinks.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            没有相关的引用链接
          </div>
        ) : (
          <div className="space-y-2 p-3">
            <p className="px-1 text-xs text-muted-foreground">
              共 {backlinks.length} 个关联
            </p>
            {backlinks.map((link) => (
              <button
                key={link.chunkId}
                className="w-full rounded-lg border bg-card p-3 text-left text-sm transition-colors hover:bg-accent"
                onClick={() => onNavigateToChunk(link.chunkId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    来自 《{link.documentTitle}》
                  </span>
                  <span className="shrink-0 text-[11px] text-primary">
                    {(link.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {link.content}
                </p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
