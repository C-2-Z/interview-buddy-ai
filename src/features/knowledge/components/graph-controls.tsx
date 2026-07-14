/** 知识图谱模块：图谱控制栏（缩放/聚焦/筛选/阈值） */

import { RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKnowledgeList } from "../hooks/use-knowledge-list";

/** 图谱控制栏属性 */
interface GraphControlsProps {
  minSimilarity: number;
  selectedDocIds: string[];
  onSimilarityChange: (value: number) => void;
  onDocFilterChange: (docIds: string[]) => void;
  onReset: () => void;
  onRebuild: () => void;
  isRebuilding: boolean;
}

/** 图谱控制栏 */
export function GraphControls({
  minSimilarity,
  selectedDocIds,
  onSimilarityChange,
  onDocFilterChange,
  onReset,
  onRebuild,
  isRebuilding,
}: GraphControlsProps) {
  const { data } = useKnowledgeList();
  const documents = data?.documents ?? [];

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/80 p-2 text-xs backdrop-blur">
      {/* 文档筛选 */}
      <Select
        value={selectedDocIds[0] ?? "_all"}
        onValueChange={(val) => {
          if (val === "_all") onDocFilterChange([]);
          else onDocFilterChange([val]);
        }}
      >
        <SelectTrigger className="h-7 w-[160px] text-xs">
          <SelectValue placeholder="全部文档" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">全部文档</SelectItem>
          {documents
            .filter((d) => d.status === "ready")
            .map((doc) => (
              <SelectItem key={doc.id} value={doc.id}>
                {doc.title}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {/* 相似度阈值 */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="size-3 text-muted-foreground" />
        <Slider
          value={[minSimilarity]}
          onValueChange={([v]) => onSimilarityChange(v)}
          min={0.5}
          max={0.95}
          step={0.05}
          className="w-20"
        />
        <span className="w-8 text-right text-[11px] text-muted-foreground">
          {minSimilarity.toFixed(2)}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-7" onClick={onReset} title="重置视图">
          <RotateCcw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onRebuild}
          disabled={isRebuilding}
          title="重建图边"
        >
          <RefreshCw className={`size-3.5 ${isRebuilding ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
