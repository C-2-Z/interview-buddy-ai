/** 服务端 AI 调用封装（兼容旧 API Key 配置）*/
// Server-only helper for DeepSeek (OpenAI-compatible API)

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * call ai
 *
 * @param messages -
 * @param model -
 * @returns Promise<
 */
export async function callAI(messages: ChatMessage[], model = "deepseek-chat"): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI 请求过于频繁，请稍后重试");
    throw new Error(`AI 调用失败: ${res.status} ${text}`);
  }

  /**
   * data
   *
   * @param await res.json() -
   * @returns
   */
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

// Extract JSON from a possibly-fenced markdown response
export function parseJsonFromAI<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // find first { or [ and last } or ]
  const start = Math.min(
    ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0),
  );
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonStr) as T;
}
