/** AI Provider 配置：定义各 Provider 的 API 地址、默认模型和环境变量名 */
import type {
  ModelProvider,
  ProviderName,
} from "../../modules/model-providers/provider.types.js";

/** Provider 的基础配置结构 */
type ProviderConfig = {
  baseUrl: string;
  envKey: string;
  defaultModel: string;
};

/** 默认 Provider：DeepSeek（当用户未选择时使用） */
export const DEFAULT_PROVIDER: ModelProvider = {
  name: "deepseek",
  model: "deepseek-chat",
};

/** 所有支持的 Provider 配置表 */
export const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-3-sonnet-20240229",
  },
};

/** 根据 Provider 名称获取配置 */
export function getProviderConfig(name: ProviderName): ProviderConfig {
  return PROVIDER_CONFIGS[name];
}

