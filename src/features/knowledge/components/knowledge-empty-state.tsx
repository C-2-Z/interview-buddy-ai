/** 知识库分享组件：空状态引导卡片 */

import { FileText, MessageSquare, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** 空状态配置 */
interface EmptyStateConfig {
  icon: "file" | "chat" | "graph";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ICON_MAP = {
  file: FileText,
  chat: MessageSquare,
  graph: Share2,
} as const;

/** 知识库空状态引导卡片 */
export function KnowledgeEmptyState({ config }: { config: EmptyStateConfig }) {
  const Icon = ICON_MAP[config.icon];

  return (
    <Card className="mx-auto max-w-md border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          <Icon className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{config.title}</h3>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {config.actionLabel && config.onAction && (
          <Button onClick={config.onAction} className="mt-2">
            {config.actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
