import type {
  ModelProvider,
  ProviderName,
} from "../../modules/model-providers/provider.types.js";
import {
  DEFAULT_PROVIDER,
  getProviderConfig,
  PROVIDER_CONFIGS,
} from "./providers.js";
import { startPerformanceSpan } from "../../modules/performance/performance.service.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AiTaskProfile = "interactive" | "generation" | "evaluation" | "report";

export type AiCallOptions = {
  stream?: boolean;
  taskProfile?: AiTaskProfile;
  maxTokens?: number;
  thinkingMode?: "enabled" | "disabled";
  outputMode?: "text" | "json";
  signal?: AbortSignal;
  traceId?: string;
};

function taskTimeoutMs(profile?: AiTaskProfile): number {
  if (profile === "generation") return Number(process.env.AI_GENERATION_TIMEOUT_MS || "90000");
  if (profile === "report") return Number(process.env.AI_REPORT_TIMEOUT_MS || "60000");
  return Number(process.env.AI_INTERACTIVE_TIMEOUT_MS || "45000");
}

function buildProviderRequest(
  provider: ModelProvider,
  messages: ChatMessage[],
  apiKey: string,
  options?: AiCallOptions,
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
      max_tokens: options?.maxTokens ?? 4096,
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

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: options?.stream ?? false,
    max_tokens: options?.maxTokens,
  };
  if (resolvedThinkingMode(provider, options)) {
    body.thinking = { type: resolvedThinkingMode(provider, options) };
  }
  if (options?.outputMode === "json") {
    body.response_format = { type: "json_object" };
  }
  return {
    url: `${cfg.baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))),
  };
}

function resolvedThinkingMode(
  provider: ModelProvider,
  options?: AiCallOptions,
): "enabled" | "disabled" | undefined {
  if (provider.name !== "deepseek") return undefined;
  return options?.thinkingMode ??
    (options?.taskProfile === "report" ? "enabled" : "disabled");
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
  options?: AiCallOptions,
): Promise<string> {
  const resolved = provider ?? DEFAULT_PROVIDER;
  const endSpan = options?.traceId
    ? startPerformanceSpan("ai.complete", {
        traceId: options.traceId,
        provider: resolved.name,
        model: resolved.model,
      })
    : null;
  const cfg = getProviderConfig(resolved.name);
  const apiKey = resolved.apiKey || process.env[cfg.envKey];
  if (!apiKey) throw new Error(`Missing ${cfg.envKey} environment variable`);

  const { url, headers, body } = buildProviderRequest(resolved, messages, apiKey, options);
  const requestSignal = options?.signal ?? AbortSignal.timeout(taskTimeoutMs(options?.taskProfile));
  const res = await fetch(url, { method: "POST", headers, body, signal: requestSignal });

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
  endSpan?.("ok");
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
  options?: Omit<AiCallOptions, "stream" | "signal">,
): AsyncIterable<string> {
  const resolved = provider ?? DEFAULT_PROVIDER;
  const endSpan = options?.traceId
    ? startPerformanceSpan("ai.stream.total", {
        traceId: options.traceId,
        provider: resolved.name,
        model: resolved.model,
      })
    : null;
  const endFirstToken = options?.traceId
    ? startPerformanceSpan("ai.stream.ttft", {
        traceId: options.traceId,
        provider: resolved.name,
        model: resolved.model,
      })
    : null;
  const cfg = getProviderConfig(resolved.name);
  const apiKey = resolved.apiKey || process.env[cfg.envKey];
  if (!apiKey) throw new Error(`Missing ${cfg.envKey} environment variable`);

  const { url, headers, body } = buildProviderRequest(
    resolved,
    messages,
    apiKey,
    { ...options, stream: true },
  );
  const requestSignal = signal ?? AbortSignal.timeout(taskTimeoutMs(options?.taskProfile));
  const res = await fetch(url, { method: "POST", headers, body, signal: requestSignal });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error(`AI 请求过于频繁，请稍后重试 (${resolved.name})`);
    }
    throw new Error(`AI 调用失败 (${resolved.name}): ${res.status} ${text}`);
  }

  let first = true;
  try {
    for await (const delta of parseSseTextStream(res, resolved.name)) {
      if (first) {
        first = false;
        endFirstToken?.("ok");
      }
      yield delta;
    }
    endSpan?.("ok");
  } catch (error) {
    endSpan?.(requestSignal.aborted ? "cancelled" : "error");
    throw error;
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

