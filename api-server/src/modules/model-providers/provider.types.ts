export type ProviderName = "deepseek" | "openai" | "anthropic";

export interface ModelProvider {
  name: ProviderName;
  model: string;
  apiKey?: string;
}

