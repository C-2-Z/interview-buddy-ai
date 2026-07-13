/**
 * 知识库 Splitter 模块：分块策略注册表 — 按名称索引，支持编译期注册和运行时切换
 */

import { SplitterBase, type SplitterStrategy, type SplitterConfig } from "./splitter-base.js";

/** 分块策略注册表 */
export class SplitterRegistry {
  private strategies = new Map<
    SplitterStrategy,
    new (config?: Partial<SplitterConfig>) => SplitterBase
  >();

  /** 注册一个分块策略 */
  register(
    name: SplitterStrategy,
    ctor: new (config?: Partial<SplitterConfig>) => SplitterBase,
  ): void {
    this.strategies.set(name, ctor);
  }

  /** 获取指定策略的实例，可传入自定义配置覆盖默认值 */
  getInstance(name: SplitterStrategy, config?: Partial<SplitterConfig>): SplitterBase {
    const ctor = this.strategies.get(name);
    if (!ctor) {
      throw new Error(
        `未知的分块策略: ${name}。可用策略: ${Array.from(this.strategies.keys()).join(", ")}`,
      );
    }
    return new ctor(config);
  }

  /** 获取所有已注册的策略名称 */
  getAvailableStrategies(): SplitterStrategy[] {
    return Array.from(this.strategies.keys());
  }
}

/** 全局单例注册表 */
export const splitterRegistry = new SplitterRegistry();
