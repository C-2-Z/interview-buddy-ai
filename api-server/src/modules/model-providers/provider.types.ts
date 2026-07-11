/** AI Provider 模型选择类型定义 */
export type ProviderName = "deepseek" | "openai" | "anthropic";

export interface ModelProvider {
  name: ProviderName;
  model: string;
  apiKey?: string;
}

