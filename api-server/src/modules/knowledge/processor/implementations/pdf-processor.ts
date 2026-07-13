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
    // pdf-parse v2 导出的是 PDFParse 类，需要实例化后调用 getText()
    const { PDFParse } = await import("pdf-parse");
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const parser = new PDFParse({ data: buf, verbosity: 0 });
    const result = await parser.getText({});
    const lines = result.text.split("\n").filter((l: string) => l.trim().length > 0);

    const title =
      options?.fileName?.replace(/\.[^/.]+$/, "") ??
      lines[0]?.trim().slice(0, 100) ??
      "PDF 文档";

    logger.info(`PDF 解析完成: ${lines.length} 行, ${result.text.length} 字符`);
    await parser.destroy();
    return { content: result.text, title };
  }
}
