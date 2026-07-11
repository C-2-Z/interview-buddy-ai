/** interview-create - AI 模型选择器 */
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModelProviderName } from "../types";

type ModelSelectorProps = {
  value: ModelProviderName;
  onChange: (value: ModelProviderName) => void;
};

/**
 * model selector
 * @returns 
 */
export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>AI 模型</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ModelProviderName)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="deepseek">DeepSeek Chat</SelectItem>
          <SelectItem value="openai">GPT-4o</SelectItem>
          <SelectItem value="anthropic">Claude 3 Sonnet</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        如服务器或设置页已配置对应 API Key 则无需填写。
      </p>
    </div>
  );
}

