/**
 * 知识库 Processor 实现：PDF 文件解析器（依赖 pdf-parse）
 */

import { createModuleLogger } from "../../../voice/voice-logger.js";
import { ProcessorBase, type ProcessResult, type ProcessOptions } from "../processor-base.js";
import type { DocFileType } from "../../knowledge.types.js";

const logger = createModuleLogger("processor-pdf");

/** 使用 pdf-parse 解析 PDF 文件的处理器 */
export class PdfProcessor extends ProcessorBase {
  readonly name = "pdf-processor";
  readonly supportedExtensions: DocFileType[] = ["pdf"];

  async process(content: string | Buffer, options?: ProcessOptions): Promise<ProcessResult> {
    // @ts-expect-error - pdf-parse v1 compat
    const pdfParse = (await import("pdf-parse")).default ?? (await import("pdf-parse"));
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const data = await pdfParse(buf);
    const lines = data.text.split("\n").filter((l: string) => l.trim().length > 0);

    const title =
      options?.fileName?.replace(/\.[^/.]+$/, "") ??
      lines[0]?.trim().slice(0, 100) ??
      "PDF 文档";

    logger.info(`PDF 解析完成: ${lines.length} 行, ${data.text.length} 字符`);
    return { content: data.text, title };
  }
}
