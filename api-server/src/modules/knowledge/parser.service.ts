/** 知识库：文件解析服务 — 支持 PDF / .docx / .txt / .md 四种格式 */

import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import type { DocFileType } from "./knowledge.types.js";

const logger = createModuleLogger("knowledge-parser");

/** 解析结果 */
export interface ParseResult {
  content: string;
  title: string;
}

/** 解析文件内容为纯文本 */
export async function parseFile(
  content: string | Buffer,
  fileType: DocFileType,
): Promise<ParseResult> {
  switch (fileType) {
    case "txt":
    case "md":
      return parseText(content);
    case "pdf":
      return parsePdf(content);
    case "docx":
      return parseDocx(content);
    default:
      throw new Error(`不支持的文档格式: ${fileType}`);
  }
}

/** 纯文本/ Markdown 解析 */
function parseText(content: string | Buffer): ParseResult {
  const text = typeof content === "string" ? content : content.toString("utf-8");
  const lines = text.split("\n");
  // 取第一行有意义的文本作为标题
  const title =
    lines
      .find((l) => l.trim().length > 0)
      ?.trim()
      .slice(0, 100) ?? "未命名文档";
  return { content: text, title };
}

/** PDF 解析（使用 pdf-parse） */
async function parsePdf(content: string | Buffer): Promise<ParseResult> {
  try {
    // @ts-expect-error - pdf-parse v1 compat
    const pdfParse = (await import("pdf-parse")).default ?? (await import("pdf-parse"));
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const data = await pdfParse(buf);
    const lines = data.text.split("\n").filter((l: string) => l.trim().length > 0);
    const title = lines[0]?.trim().slice(0, 100) ?? "PDF 文档";
    logger.info(`PDF 解析完成: ${lines.length} 行, ${data.text.length} 字符`);
    return { content: data.text, title };
  } catch (err) {
    logger.error(err instanceof Error ? err : new Error("PDF 解析失败"), {
      operation: "parse_pdf",
    });
    throw new Error(`PDF 解析失败: ${err instanceof Error ? err.message : "未知错误"}`);
  }
}

/** .docx 解析（使用 mammoth） */
async function parseDocx(content: string | Buffer): Promise<ParseResult> {
  try {
    const mammoth = await import("mammoth");
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const result = await mammoth.extractRawText({ buffer: buf });
    const lines = result.value.split("\n").filter((l: string) => l.trim().length > 0);
    const title = lines[0]?.trim().slice(0, 100) ?? "Word 文档";
    logger.info(`DOCX 解析完成: ${lines.length} 行, ${result.value.length} 字符`);
    return { content: result.value, title };
  } catch (err) {
    logger.error(err instanceof Error ? err : new Error("DOCX 解析失败"), {
      operation: "parse_docx",
    });
    throw new Error(`DOCX 解析失败: ${err instanceof Error ? err.message : "未知错误"}`);
  }
}
