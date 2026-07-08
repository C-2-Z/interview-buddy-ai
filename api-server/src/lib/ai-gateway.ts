export type ProviderName = "deepseek" | "openai" | "anthropic";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelProvider {
  name: ProviderName;
  model: string;
  /** Optional user-provided API key. Falls back to the server env var. */
  apiKey?: string;
}

const DEFAULT_PROVIDER: ModelProvider = {
  name: "deepseek",
  model: "deepseek-chat",
};

const PROVIDER_CONFIGS: Record<
  ProviderName,
  {
    baseUrl: string;
    envKey: string;
    defaultModel: string;
  }
> = {
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

/** Build provider-specific request body and headers for a chat completion call. */
function buildProviderRequest(
  provider: ModelProvider,
  messages: ChatMessage[],
  apiKey: string,
): { url: string; headers: Record<string, string>; body: string } {
  const cfg = PROVIDER_CONFIGS[provider.name];
  const model = provider.model || cfg.defaultModel;

  switch (provider.name) {
    case "deepseek":
    case "openai": {
      return {
        url: `${cfg.baseUrl}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages }),
      };
    }
    case "anthropic": {
      // Anthropic has no "system" role in messages array; uses a top-level "system" field
      const systemMsg = messages.find((m) => m.role === "system");
      const chatMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));
      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: chatMessages,
      };
      if (systemMsg) {
        body.system = systemMsg.content;
      }
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
  }
}

/** Extract response text from a provider-specific API response. */
function extractResponseText(
  provider: ProviderName,
  data: Record<string, unknown>,
): string {
  if (provider === "anthropic") {
    const content = data.content as Array<{ type: string; text: string }> | undefined;
    if (content && content.length > 0) {
      return content.map((c) => c.text).join("");
    }
    return "";
  }
  // OpenAI-compatible (DeepSeek, OpenAI, etc.)
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? "";
}

export async function callAI(
  messages: ChatMessage[],
  provider?: ModelProvider,
): Promise<string> {
  const p = provider ?? DEFAULT_PROVIDER;
  const cfg = PROVIDER_CONFIGS[p.name];
  const key = p.apiKey || process.env[cfg.envKey];
  if (!key) throw new Error(`Missing ${cfg.envKey} environment variable`);

  const { url, headers, body } = buildProviderRequest(p, messages, key);
  const res = await fetch(url, { method: "POST", headers, body });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429)
      throw new Error(`AI 请求过于频繁，请稍后重试 (${p.name})`);
    throw new Error(`AI 调用失败 (${p.name}): ${res.status} ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const content = extractResponseText(p.name, data);
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

/** Shorthand to callAI with a specific provider. */
export function callAIWithProvider(
  messages: ChatMessage[],
  name: ProviderName,
  model?: string,
): Promise<string> {
  const cfg = PROVIDER_CONFIGS[name];
  return callAI(messages, { name, model: model ?? cfg.defaultModel });
}

/** Extract JSON from a possibly-fenced markdown response. */
export function parseJsonFromAI<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = Math.min(
    ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0),
  );
  const end = Math.max(
    cleaned.lastIndexOf("}"),
    cleaned.lastIndexOf("]"),
  );
  const jsonStr =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonStr) as T;
}
