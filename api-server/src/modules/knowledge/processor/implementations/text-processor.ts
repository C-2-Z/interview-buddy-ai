/**
 * 知识库 Processor 实现：纯文本 / Markdown 解析器
 */

import { ProcessorBase, type ProcessResult, type ProcessOptions } from "../processor-base.js";
import type { DocFileType } from "../../knowledge.types.js";

/** 处理纯文本 (.txt) 和 Markdown (.md) 文件的解析器 */
export class TextProcessor extends ProcessorBase {
  readonly name = "text-processor";
  readonly supportedExtensions: DocFileType[] = ["txt", "md"];

  process(content: string | Buffer, options?: ProcessOptions): ProcessResult {
    const text = typeof content === "string" ? content : content.toString("utf-8");
    const lines = text.split("\n");

    // 取第一行有意义的文本作为标题
    const title =
      options?.fileName?.replace(/\.[^/.]+$/, "") ??
      lines.find((l) => l.trim().length > 0)?.trim().slice(0, 100) ??
      "未命名文档";

    return { content: text, title };
  }
}
