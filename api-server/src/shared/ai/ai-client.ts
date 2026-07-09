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
  options?: { stream?: boolean },
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
    if (options?.stream) body.stream = true;
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
    body: JSON.stringify({ model, messages, stream: options?.stream ?? false }),
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

function extractStreamText(
  provider: ProviderName,
  data: Record<string, unknown>,
): string {
  if (provider === "anthropic") {
    const delta = data.delta as Record<string, unknown> | undefined;
    if (typeof delta?.text === "string") return delta.text;
    const contentBlock = data.content_block as Record<string, unknown> | undefined;
    if (typeof contentBlock?.text === "string") return contentBlock.text;
    return "";
  }

  const choices = data.choices as
    | Array<{ delta?: { content?: string }; text?: string }>
    | undefined;
  return choices?.[0]?.delta?.content ?? choices?.[0]?.text ?? "";
}

async function* parseSseTextStream(
  response: Response,
  provider: ProviderName,
): AsyncIterable<string> {
  if (!response.body) throw new Error("AI stream response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const data = JSON.parse(payload) as Record<string, unknown>;
        const text = extractStreamText(provider, data);
        if (text) yield text;
      } catch {
        // Ignore malformed stream frames; providers can emit keep-alives.
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const payload = tail.slice("data:".length).trim();
    if (payload && payload !== "[DONE]") {
      try {
        const data = JSON.parse(payload) as Record<string, unknown>;
        const text = extractStreamText(provider, data);
        if (text) yield text;
      } catch {
        // Ignore malformed tail frames.
      }
    }
  }
}

export async function* streamAI(
  messages: ChatMessage[],
  provider?: ModelProvider,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const resolved = provider ?? DEFAULT_PROVIDER;
  const cfg = getProviderConfig(resolved.name);
  const apiKey = resolved.apiKey || process.env[cfg.envKey];
  if (!apiKey) throw new Error(`Missing ${cfg.envKey} environment variable`);

  const { url, headers, body } = buildProviderRequest(
    resolved,
    messages,
    apiKey,
    { stream: true },
  );
  const res = await fetch(url, { method: "POST", headers, body, signal });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error(`AI 璇锋眰杩囦簬棰戠箒锛岃绋嶅悗閲嶈瘯 (${resolved.name})`);
    }
    throw new Error(`AI 璋冪敤澶辫触 (${resolved.name}): ${res.status} ${text}`);
  }

  for await (const delta of parseSseTextStream(res, resolved.name)) {
    yield delta;
  }
}

export function callAIWithProvider(
  messages: ChatMessage[],
  name: ProviderName,
  model?: string,
): Promise<string> {
  const cfg = PROVIDER_CONFIGS[name];
  return callAI(messages, { name, model: model ?? cfg.defaultModel });
}

