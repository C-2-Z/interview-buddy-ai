/**
 * 知识库 Processor 模块：ProcessorBase 抽象基类 — 定义文件解析器的统一接口
 */

import type { DocFileType } from "../knowledge.types.js";

/** 文件解析结果 */
export interface ProcessResult {
  /** 解析后的纯文本内容 */
  content: string;
  /** 提取的文档标题 */
  title: string;
}

/** 文件解析器的通用选项 */
export interface ProcessOptions {
  /** 原始文件名（用于提取标题等）*/
  fileName?: string;
}

/**
 * ProcessorBase — 所有文件格式解析器的抽象基类
 * 新的文件格式只需要继承 ProcessorBase，通过 processorRegistry.register() 注册即可
 */
export abstract class ProcessorBase {
  /** 本 processor 支持的文件类型列表 */
  abstract readonly supportedExtensions: DocFileType[];

  /** processor 的唯一标识名称 */
  abstract readonly name: string;

  /** 解析优先级（数字越小优先级越高）*/
  readonly priority: number = 100;

  /** 执行文件解析，返回纯文本内容和标题 */
  abstract process(
    content: string | Buffer,
    options?: ProcessOptions,
  ): Promise<ProcessResult> | ProcessResult;

  /** 检查当前 processor 是否支持指定的文件类型 */
  canHandle(fileType: DocFileType): boolean {
    return this.supportedExtensions.includes(fileType);
  }
}
