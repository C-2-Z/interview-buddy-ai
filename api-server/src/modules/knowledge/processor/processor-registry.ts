/**
 * 知识库 Processor 模块：Processor 注册表 — 以文件类型索引，支持优先级排序
 * 借鉴 Quivr 的 processor/registry.py 设计，提供可扩展的解析器注册机制
 */

import type { DocFileType } from "../knowledge.types.js";
import type { ProcessResult, ProcessOptions } from "./processor-base.js";
import { ProcessorBase } from "./processor-base.js";

/** 内部存储的注册项 */
interface RegistryEntry {
  processor: ProcessorBase;
}

/** Processor 注册表 — 按文件类型索引，每个类型对应一个 processor 列表（按优先级排序）*/
export class ProcessorRegistry {
  /** 类型 → processor[] 的映射，按优先级升序 */
  private entries = new Map<DocFileType, RegistryEntry[]>();

  /** 注册一个 processor
   *  如果已有同类型同优先级（或更高优先级）的 processor，新注册的按优先级插入有序列表
   */
  register(processor: ProcessorBase): void {
    for (const ext of processor.supportedExtensions) {
      const list = this.entries.get(ext) ?? [];
      // 插入时按优先级排序
      list.push({ processor });
      list.sort((a, b) => a.processor.priority - b.processor.priority);
      this.entries.set(ext, list);
    }
  }

  /** 获取指定文件类型的所有已注册 processor（按优先级升序）*/
  getProcessors(fileType: DocFileType): ProcessorBase[] {
    return (this.entries.get(fileType) ?? []).map((e) => e.processor);
  }

  /** 获取指定类型的最佳 processor（优先级最高的第一个）*/
  getBestProcessor(fileType: DocFileType): ProcessorBase | null {
    const processors = this.getProcessors(fileType);
    return processors.length > 0 ? processors[0] : null;
  }

  /** 解析文件内容：按优先级尝试所有匹配的 processor，直到成功 */
  async process(
    content: string | Buffer,
    fileType: DocFileType,
    options?: ProcessOptions,
  ): Promise<ProcessResult> {
    const processors = this.getProcessors(fileType);
    if (processors.length === 0) {
      throw new Error(`不支持的文档格式: ${fileType}，未注册对应的 Processor`);
    }

    // 按优先级从高到低尝试，第一个成功的返回
    const errors: Error[] = [];
    for (const processor of processors) {
      try {
        return await processor.process(content, options);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    throw new Error(
      `文件解析失败（${fileType}）：所有 Processor 均失败。最后错误: ${errors[errors.length - 1]?.message ?? "未知错误"}`,
    );
  }

  /** 获取所有已注册的文件类型 */
  getRegisteredTypes(): DocFileType[] {
    return Array.from(this.entries.keys());
  }
}

/** 全局单例注册表 */
export const processorRegistry = new ProcessorRegistry();
