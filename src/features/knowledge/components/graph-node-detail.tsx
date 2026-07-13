/** 知识图谱模块：点击节点后的详情侧面板 */

import { X, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { GraphBacklinkList } from "./graph-backlink-list";
import type { GraphNode, BacklinkDetail } from "../types";
import { useState } from "react";

/** 节点详情面板属性 */
interface GraphNodeDetailProps {
  node: GraphNode;
  backlinks: BacklinkDetail[] | undefined;
  backlinksLoading: boolean;
  onClose: () => void;
  onNavigateToChunk: (chunkId: string) => void;
}

/** 节点详情侧面板 */
export function GraphNodeDetail({
  node,
  backlinks,
  backlinksLoading,
  onClose,
  onNavigateToChunk,
}: GraphNodeDetailProps) {
  const [showBacklinks, setShowBacklinks] = useState(false);

  const isDocument = node.type === "document";

  if (showBacklinks) {
    return (
      <div className="flex h-full flex-col border-l bg-card">
        <GraphBacklinkList
          backlinks={backlinks}
          isLoading={backlinksLoading}
          chunkLabel={node.label}
          onBack={() => setShowBacklinks(false)}
          onNavigateToChunk={onNavigateToChunk}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l bg-card">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h4 className="truncate text-sm font-medium">节点详情</h4>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* 节点信息 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full" style={{ backgroundColor: node.color }} />
              <Badge variant="outline" className="text-[11px]">
                {isDocument ? "文档" : "知识片段"}
              </Badge>
            </div>
            <h3 className="text-sm font-semibold">{node.label}</h3>
          </div>

          {/* chunk 内容预览 */}
          {node.content && (
            <div className="space-y-1">
              <h5 className="text-xs font-medium text-muted-foreground">内容预览</h5>
              <p className="rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                {node.content}
              </p>
            </div>
          )}

          {/* 查看反链 */}
          <Button variant="outline" className="w-full gap-2" onClick={() => setShowBacklinks(true)}>
            <ExternalLink className="size-4" />
            查看关联引用 ({backlinks?.length ?? 0})
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
