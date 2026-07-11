/** settings - 用户设置 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getSettings,
  updateSettings,
} from "../api";

export const PROVIDERS = ["deepseek", "openai", "anthropic"] as const;
export const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/**
 * use settings
 * @returns
 */
export function useSettings() {
  const [modelProvider, setModelProvider] = useState("deepseek");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [keyStatus, setKeyStatus] = useState<
    Record<string, { set: boolean; masked: string | null }>
  >({});
  const [toClear, setToClear] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /**
   * 重新加载
   * @returns Promise<
   */
  async function reload() {
    const result = await getSettings();
    setModelProvider(result.model_provider);
    setKeyStatus(result.keys);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  /**
   * 更新 key
   *
   * @param provider -
   * @param value -
   * @returns
   */
  function updateKey(provider: string, value: string) {
    setKeys((prev) => ({ ...prev, [provider]: value }));
  }

  /**
   * 清空 key
   *
   * @param provider -
   * @returns
   */
  function clearKey(provider: string) {
    setToClear((prev) => new Set(prev).add(provider));
    setKeyStatus((prev) => ({
      ...prev,
      [provider]: { set: false, masked: null },
    }));
  }

  /**
   * 保存
   * @returns Promise<
   */
  async function save() {
    setSaving(true);
    try {
      const body: {
        model_provider: string;
        keys: Record<string, string>;
      } = {
        model_provider: modelProvider,
        keys: {},
      };
      for (const [provider, value] of Object.entries(keys)) {
        if (value) body.keys[provider] = value;
        else if (toClear.has(provider)) body.keys[provider] = "";
      }
      await updateSettings(body);
      toast.success("设置已保存");
      setKeys({});
      setToClear(new Set());
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return {
    modelProvider,
    setModelProvider,
    keys,
    keyStatus,
    toClear,
    loading,
    saving,
    updateKey,
    clearKey,
    save,
  };
}

