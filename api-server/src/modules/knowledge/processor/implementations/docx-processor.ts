/**
 * 知识库 Processor 实现：Word (.docx) 文件解析器（依赖 mammoth）
 */

import { createModuleLogger } from "../../../voice/voice-logger.js";
import { ProcessorBase, type ProcessResult, type ProcessOptions } from "../processor-base.js";
import type { DocFileType } from "../../knowledge.types.js";

const logger = createModuleLogger("processor-docx");

/** 使用 mammoth 解析 .docx 文件的处理器 */
export class DocxProcessor extends ProcessorBase {
  readonly name = "docx-processor";
  readonly supportedExtensions: DocFileType[] = ["docx"];

  async process(content: string | Buffer, options?: ProcessOptions): Promise<ProcessResult> {
    const mammoth = await import("mammoth");
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const result = await mammoth.extractRawText({ buffer: buf });
    const lines = result.value.split("\n").filter((l: string) => l.trim().length > 0);

    const title =
      options?.fileName?.replace(/\.[^/.]+$/, "") ??
      lines[0]?.trim().slice(0, 100) ??
      "Word 文档";

    logger.info(`DOCX 解析完成: ${lines.length} 行, ${result.value.length} 字符`);
    return { content: result.value, title };
  }
}
