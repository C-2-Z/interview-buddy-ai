/** 知识库管理：单个文档卡片组件 */

import { FileText, Loader2, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { KnowledgeDocument } from "../types";

/** 文档卡片属性 */
interface DocumentCardProps {
  document: KnowledgeDocument;
  isSelected?: boolean;
  onToggle?: (id: string) => void;
  onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  processing: { icon: Loader2, label: "处理中", variant: "secondary" as const },
  ready: { icon: CheckCircle2, label: "已就绪", variant: "default" as const },
  failed: { icon: AlertCircle, label: "失败", variant: "destructive" as const },
} as const;

/** 文件类型图标映射 */
const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "文本",
  md: "Markdown",
};

/** 单个文档卡片 */
export function DocumentCard({ document: doc, isSelected, onToggle, onDelete }: DocumentCardProps) {
  const status = STATUS_CONFIG[doc.status];
  const StatusIcon = status.icon;
  const isProcessing = doc.status === "processing";

  return (
    <Card className="group relative transition-shadow hover:shadow-md">
      <CardContent className="flex items-start gap-4 p-4">
        {/* 选择框 */}
        {onToggle && (
          <div className="flex shrink-0 items-center pt-2">
            <input
              type="checkbox"
              checked={isSelected ?? false}
              onChange={() => onToggle(doc.id)}
              className="size-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
            />
          </div>
        )}
        {/* 文件图标 */}
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="size-6 text-primary" />
        </div>

        {/* 文档信息 */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium">{doc.title}</h4>
            {isProcessing && (
              <StatusIcon className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{FILE_TYPE_LABELS[doc.fileType] ?? doc.fileType.toUpperCase()}</span>
            {doc.fileSize && <span>· {(doc.fileSize / 1024 / 1024).toFixed(1)}MB</span>}
            <span>· {doc.chunkCount} 分块</span>
          </div>
          {doc.status === "failed" && doc.errorMessage && (
            <p className="text-xs text-destructive">{doc.errorMessage}</p>
          )}
        </div>

        {/* 状态 + 操作 */}
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={status.variant} className="gap-1">
            <StatusIcon className={`size-3 ${isProcessing ? "animate-spin" : ""}`} />
            {status.label}
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onDelete(doc.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除文档</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
