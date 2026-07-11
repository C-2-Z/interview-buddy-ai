/** 从 LLM 的回复中提取并解析 JSON
 *  处理常见格式问题：Markdown 代码块包裹、前后空白、多余文本
 *  先尝试清理 Markdown 围栏，再定位第一个 { 或 [ 到最后一个 } 或 ] */
export function parseJsonFromAI<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  // 找到第一个 { 或 [ 作为 JSON 的起始位置
  const start = Math.min(
    ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0),
  );
  // 找到最后一个 } 或 ] 作为 JSON 的结束位置
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  const jsonStr =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonStr) as T;
}

