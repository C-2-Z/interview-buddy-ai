/** 知识库管理：文档列表组件 */

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { DocumentCard } from "./document-card";
import { KnowledgeEmptyState } from "./knowledge-empty-state";
import { Button } from "@/components/ui/button";
import { batchDeleteDocuments } from "../api";
import type { KnowledgeDocument } from "../types";

/** 文档列表面板属性 */
interface DocumentListPanelProps {
  documents: KnowledgeDocument[] | undefined;
  isLoading: boolean;
  onDelete: (id: string) => void;
  onUploadClick: () => void;
}

/** 文档列表主面板 */
export function DocumentListPanel({ documents, isLoading, onDelete, onUploadClick }: DocumentListPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!documents) return;
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await batchDeleteDocuments(ids);
      setSelectedIds(new Set());
      ids.forEach((id) => onDelete(id));
    } catch {}
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="py-12">
        <KnowledgeEmptyState
          config={{
            icon: "file",
            title: "知识库还是空的",
            description: "上传文档或粘贴文本，AI 将自动解析、分块并建立知识网络",
            actionLabel: "上传文档",
            onAction: onUploadClick,
          }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            已选择 {selectedIds.size} 篇文档
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              取消选择
            </Button>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleBatchDelete}>
              <Trash2 className="size-3.5" />
              删除选中
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            document={doc}
            isSelected={selectedIds.has(doc.id)}
            onToggle={toggleSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
