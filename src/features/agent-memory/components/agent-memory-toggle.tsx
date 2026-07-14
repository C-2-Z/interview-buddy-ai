/** 训练记忆授权组件：明确展示数据范围并同步全局开关与本场选择。 */
import { BrainCircuit, Loader2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAgentMemory } from "../hooks/use-agent-memory";

/** 在创建面试时让用户主动授权长期摘要，并允许独立清除历史聚合。 */
export function AgentMemoryToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange(value: boolean): void;
}) {
  const memory = useAgentMemory();

  useEffect(() => {
    // 恢复旧草稿时仍以服务端当前授权为准，避免发送已撤销的本场许可。
    if (!memory.isLoading && memory.data?.enabled === false && checked) onCheckedChange(false);
  }, [checked, memory.data?.enabled, memory.isLoading, onCheckedChange]);

  /** 开启时先写入全局授权，关闭时立即停止后续会话使用。 */
  async function toggle(value: boolean) {
    await memory.setEnabled(value);
    onCheckedChange(value);
  }

  /** 清除只影响聚合摘要，不修改面试报告。 */
  async function clear() {
    await memory.clear();
    onCheckedChange(false);
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-3">
          <BrainCircuit className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">使用历史训练记忆</div>
            <div className="text-xs leading-5 text-muted-foreground">
              仅使用维度分、重复弱项和训练趋势，不保存或读取回答原文。
            </div>
          </div>
        </div>
        {memory.isLoading || memory.pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Switch
            aria-label="使用历史训练记忆"
            checked={checked && memory.data?.enabled === true}
            onCheckedChange={(value) => void toggle(value)}
          />
        )}
      </div>
      {memory.data?.summary && (
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>已汇总 {memory.data.summary.completedSessionCount} 场有效报告</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void clear()}
            disabled={memory.pending}
          >
            <Trash2 />清除训练记忆
          </Button>
        </div>
      )}
    </div>
  );
}
