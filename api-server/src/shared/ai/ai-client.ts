import type {
  ModelProvider,
  ProviderName,
} from "../../modules/model-providers/provider.types.js";
import {
  DEFAULT_PROVIDER,
  getProviderConfig,
  PROVIDER_CONFIGS,
} from "./providers.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildProviderRequest(
  provider: ModelProvider,
  messages: ChatMessage[],
  apiKey: string,
): { url: string; headers: Record<string, string>; body: string } {
  const cfg = getProviderConfig(provider.name);
  const model = provider.model || cfg.defaultModel;

  if (provider.name === "anthropic") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: chatMessages,
    };
    if (systemMsg) body.system = systemMsg.content;
    return {
      url: `${cfg.baseUrl}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    };
  }

  return {
    url: `${cfg.baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  };
}

function extractResponseText(
  provider: ProviderName,
  data: Record<string, unknown>,
): string {
  if (provider === "anthropic") {
    const content = data.content as
      | Array<{ type: string; text: string }>
      | undefined;
    return content?.map((c) => c.text).join("") ?? "";
  }
  const choices = data.choices as
    | Array<{ message?: { content?: string } }>
    | undefined;
  return choices?.[0]?.message?.content ?? "";
}

export async function callAI(
  messages: ChatMessage[],
  provider?: ModelProvider,
): Promise<string> {
  const resolved = provider ?? DEFAULT_PROVIDER;
  const cfg = getProviderConfig(resolved.name);
  const apiKey = resolved.apiKey || process.env[cfg.envKey];
  if (!apiKey) throw new Error(`Missing ${cfg.envKey} environment variable`);

  const { url, headers, body } = buildProviderRequest(resolved, messages, apiKey);
  const res = await fetch(url, { method: "POST", headers, body });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error(`AI 请求过于频繁，请稍后重试 (${resolved.name})`);
    }
    throw new Error(`AI 调用失败 (${resolved.name}): ${res.status} ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const content = extractResponseText(resolved.name, data);
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

export function callAIWithProvider(
  messages: ChatMessage[],
  name: ProviderName,
  model?: string,
): Promise<string> {
  const cfg = PROVIDER_CONFIGS[name];
  return callAI(messages, { name, model: model ?? cfg.defaultModel });
}

