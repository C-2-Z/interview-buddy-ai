import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Loader2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const PROVIDERS = ["deepseek", "openai", "anthropic"] as const;
const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function SettingsPage() {
  const [modelProvider, setModelProvider] = useState("deepseek");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [keyStatus, setKeyStatus] = useState<
    Record<string, { set: boolean; masked: string | null }>
  >({});
  const [toClear, setToClear] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient
      .getSettings()
      .then((res) => {
        setModelProvider(res.model_provider);
        setKeyStatus(res.keys);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        model_provider: modelProvider,
        keys: {} as Record<string, string>,
      };
      // Include keys the user typed
      for (const [provider, value] of Object.entries(keys)) {
        if (value) {
          (body.keys as Record<string, string>)[provider] = value;
        } else if (toClear.has(provider)) {
          // User explicitly cleared this key
          (body.keys as Record<string, string>)[provider] = "";
        }
      }
      await apiClient.updateSettings(body);
      toast.success("设置已保存");
      setKeys({});
      setToClear(new Set());
      const res = await apiClient.getSettings();
      setKeyStatus(res.keys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function clearKey(provider: string) {
    setToClear((prev) => new Set(prev).add(provider));
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: { set: false, masked: null },
    }));
  }

  if (loading) {
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
          <Select value={modelProvider} onValueChange={setModelProvider}>
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
          const label = PROVIDER_LABELS[provider];
          const isSet =
            keyStatus[provider]?.set && !toClear.has(provider);
          return (
            <div key={provider} className="space-y-2">
              <Label htmlFor={`key-${provider}`}>
                {label} API Key
                {isSet && (
                  <span className="text-muted-foreground text-xs ml-2">
                    (已设置 {keyStatus[provider]?.masked ?? ""})
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`key-${provider}`}
                  type="password"
                  placeholder={isSet ? "输入新值以替换" : "sk-..."}
                  value={keys[provider] ?? ""}
                  onChange={(e) =>
                    setKeys((prev) => ({
                      ...prev,
                      [provider]: e.target.value,
                    }))
                  }
                  className="flex-1"
                />
                {isSet && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => clearKey(provider)}
                  >
                    清除
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
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
