/**
 * 知识库页面：知识库（Brain）选择器 — 显示当前知识库、切换、创建
 */

import { useState } from "react";
import { BookOpen, Plus, Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useBrains, useCreateBrain, useDeleteBrain } from "../hooks/use-brains";
import type { Brain } from "../types";

/** 知识库选择器属性 */
interface BrainSelectorProps {
  activeBrainId: string | null;
  onBrainChange: (brain: Brain) => void;
}

/** 知识库选择器（下拉 + 创建对话框）*/
export function BrainSelector({ activeBrainId, onBrainChange }: BrainSelectorProps) {
  const { data: brainsData, isLoading } = useBrains();
  const createBrainMutation = useCreateBrain();
  const deleteBrainMutation = useDeleteBrain();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const brains = brainsData?.brains ?? [];
  const activeBrain = brains.find((b) => b.id === activeBrainId) ?? brains[0];

  /** 创建新知识库 */
  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("请输入知识库名称");
      return;
    }
    try {
      const result = await createBrainMutation.mutateAsync({ name });
      onBrainChange(result.brain);
      setShowCreate(false);
      setNewName("");
      toast.success(`知识库「${name}」已创建`);
    } catch (err) {
      toast.error("创建知识库失败");
    }
  }

  /** 删除知识库 */
  async function handleDelete(e: React.MouseEvent, brain: Brain) {
    e.stopPropagation();
    if (brains.length <= 1) {
      toast.error("至少保留一个知识库");
      return;
    }
    try {
      await deleteBrainMutation.mutateAsync(brain.id);
      if (activeBrainId === brain.id) {
        const remaining = brains.filter((b) => b.id !== brain.id);
        if (remaining.length > 0) onBrainChange(remaining[0]);
      }
      toast.success(`知识库「${brain.name}」已删除`);
    } catch (err) {
      toast.error("删除知识库失败");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <BookOpen className="size-4 animate-pulse text-muted-foreground" />
        <span className="text-sm text-muted-foreground">加载知识库...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <BookOpen className="size-4 text-muted-foreground" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-sm font-medium">
            {activeBrain?.name ?? "选择知识库"}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {brains.map((brain) => (
            <DropdownMenuItem
              key={brain.id}
              className="flex items-center justify-between"
              onSelect={() => onBrainChange(brain)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{brain.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {brain.documentCount} 文档
                </span>
              </div>
              <div className="flex items-center gap-1">
                {brain.id === activeBrainId && (
                  <Check className="size-3.5 text-primary" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDelete(e, brain)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShowCreate(true)}>
            <Plus className="mr-2 size-4" />
            <span>新建知识库</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 创建知识库对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="输入知识库名称"
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
