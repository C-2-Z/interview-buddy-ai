import type {
  ModelProvider,
  ProviderName,
} from "../../modules/model-providers/provider.types.js";

type ProviderConfig = {
  baseUrl: string;
  envKey: string;
  defaultModel: string;
};

export const DEFAULT_PROVIDER: ModelProvider = {
  name: "deepseek",
  model: "deepseek-v4-flash",
};

export const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
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

export function getProviderConfig(name: ProviderName): ProviderConfig {
  return PROVIDER_CONFIGS[name];
}

