/**
 * QA 模块：文档选择器 — 在创建会话前选择目标文档
 */

import { useState } from "react";
import { FileText, CheckSquare, Square, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { KnowledgeDocument } from "../types";

/** 文档选择器属性 */
interface QaDocumentSelectorProps {
  documents: KnowledgeDocument[];
  onStartSession: (documentIds: string[]) => void;
}

/** QA 文档选择器：创建问答会话前选择要问的文档 */
export function QaDocumentSelector({ documents, onStartSession }: QaDocumentSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** 切换文档选择 */
  function toggleDoc(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** 全选/取消全选 */
  function toggleAll() {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  }

  /** 开始问答 */
  function handleStart() {
    onStartSession(Array.from(selectedIds));
  }

  const readyDocs = documents.filter((d) => d.status === "ready");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">选择文档</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedIds.size}/{readyDocs.length}
          </span>
          {readyDocs.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
              {selectedIds.size === readyDocs.length ? "取消全选" : "全选"}
            </Button>
          )}
        </div>
      </div>

      {readyDocs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <FileText className="mx-auto size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">没有可用的文档</p>
            <p className="text-xs text-muted-foreground/60">先上传一些文档到知识库</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {readyDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => toggleDoc(doc.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                {selectedIds.has(doc.id) ? (
                  <CheckSquare className="size-4 shrink-0 text-primary" />
                ) : (
                  <Square className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{doc.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {doc.fileType.toUpperCase()} · {doc.chunkCount} 片段
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* 底部操作栏 */}
      <div className="border-t p-3">
        <Button
          className="w-full gap-2"
          disabled={selectedIds.size === 0}
          onClick={handleStart}
        >
          <MessageSquare className="size-4" />
          开始问答（{selectedIds.size} 篇文档）
        </Button>
      </div>
    </div>
  );
}
