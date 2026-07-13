/** Q&A 模块：空状态引导 */

import { MessageSquarePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** QA 空状态属性 */
interface QaEmptyStateProps {
  onCreateSession: () => void;
}

/** QA 空状态：引导创建问答会话 */
export function QaEmptyState({ onCreateSession }: QaEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="mx-auto max-w-sm border-dashed shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <MessageSquarePlus className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">还没有问答记录</h3>
            <p className="text-sm text-muted-foreground">
              创建新的问答会话，选择知识库文档，开始提问
            </p>
          </div>
          <Button onClick={onCreateSession}>开始问答</Button>
        </CardContent>
      </Card>
    </div>
  );
}
