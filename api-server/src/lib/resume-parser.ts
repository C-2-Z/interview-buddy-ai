import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.min.mjs";
import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api.js";

/** 解析后的文本结果 */
export interface ParseResult {
  text: string;
  pageCount?: number;
}

/** 支持的 MIME 类型列表 */
const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

/** 判断是否为支持的文档类型 */
export function isSupportedType(mime: string, fileName: string): boolean {
  if (SUPPORTED_TYPES.includes(mime)) return true;
  const ext = fileName.toLowerCase().split(".").pop();
  return ["pdf", "docx", "txt", "md"].includes(ext ?? "");
}

/** 根据 MIME 类型 + 文件名解析文档为纯文本 */
export async function parseResume(
  buffer: Buffer,
  mime: string,
  fileName: string,
): Promise<ParseResult> {
  const ext = fileName.toLowerCase();
  if (mime.includes("pdf") || ext.endsWith(".pdf")) {
    return parsePdf(buffer);
  }
  if (mime.includes("word") || ext.endsWith(".docx")) {
    return parseDocx(buffer);
  }
  // TXT / MD / 纯文本兜底
  return { text: buffer.toString("utf-8") };
}

/** PDF 解析：使用 pdfjs-dist （静态导入，仅初始化一次） */
async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content: TextContent = await page.getTextContent();
    const text = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item: TextItem) => item.str)
      .join(" ");
    pages.push(text);
  }

  const pageCount = doc.numPages;
  await doc.destroy();
  return { text: pages.join("\n\n"), pageCount };
}

/** DOCX 解析：使用 mammoth */
async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}
