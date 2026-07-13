/**
 * 知识库 Processor 模块：注册所有内置的处理器到全局注册表
 * 如需添加新的文件格式，在此处 import 并 register 即可
 */

import { processorRegistry } from "./processor-registry.js";
import { TextProcessor } from "./implementations/text-processor.js";
import { PdfProcessor } from "./implementations/pdf-processor.js";
import { DocxProcessor } from "./implementations/docx-processor.js";

/** 注册所有内置 Processor */
export function registerBuiltinProcessors(): void {
  processorRegistry.register(new TextProcessor());
  processorRegistry.register(new PdfProcessor());
  processorRegistry.register(new DocxProcessor());
}

export { processorRegistry, ProcessorRegistry } from "./processor-registry.js";
export { ProcessorBase, type ProcessResult, type ProcessOptions } from "./processor-base.js";
