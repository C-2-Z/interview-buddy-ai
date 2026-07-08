import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROVIDER_LABELS,
  PROVIDERS,
  useSettings,
} from "../hooks/use-settings";

export function SettingsForm() {
  const settings = useSettings();

  if (settings.loading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-10 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>设置</CardTitle>
        <CardDescription>
          配置默认 AI 模型和 API Key，创建新面试时将自动应用。API Key 会加密存储在服务器上。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>默认 AI 模型</Label>
          <Select
            value={settings.modelProvider}
            onValueChange={settings.setModelProvider}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek">DeepSeek Chat</SelectItem>
              <SelectItem value="openai">GPT-4o</SelectItem>
              <SelectItem value="anthropic">Claude 3 Sonnet</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {PROVIDERS.map((provider) => {
          const isSet =
            settings.keyStatus[provider]?.set && !settings.toClear.has(provider);
          return (
            <div key={provider} className="space-y-2">
              <Label htmlFor={`key-${provider}`}>
                {PROVIDER_LABELS[provider]} API Key
                {isSet && (
                  <span className="text-muted-foreground text-xs ml-2">
                    (已设置 {settings.keyStatus[provider]?.masked ?? ""})
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`key-${provider}`}
                  type="password"
                  placeholder={isSet ? "输入新值以替换" : "sk-..."}
                  value={settings.keys[provider] ?? ""}
                  onChange={(e) => settings.updateKey(provider, e.target.value)}
                  className="flex-1"
                />
                {isSet && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => settings.clearKey(provider)}
                  >
                    清除
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <Button
          onClick={settings.save}
          disabled={settings.saving}
          className="w-full"
        >
          {settings.saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              保存中…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              保存设置
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

