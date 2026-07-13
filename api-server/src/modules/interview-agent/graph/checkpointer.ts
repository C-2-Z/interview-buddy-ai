/** Interview Agent PostgreSQL checkpointer 的运行时工厂与安全配置校验。 */
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MemorySaver } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from "@langchain/langgraph-checkpoint";

/** Agent v1 的固定 LangGraph checkpoint namespace。 */
export const AGENT_CHECKPOINT_NAMESPACE = "agent-v1" as const;

/** 未配置环境变量时使用的私有 PostgreSQL schema。 */
export const DEFAULT_AGENT_CHECKPOINT_SCHEMA = "langgraph";

/** PostgreSQL 未加引号标识符允许的严格 schema 格式。 */
export const AGENT_CHECKPOINT_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** 创建 PostgreSQL checkpointer 时允许覆盖的运行时配置。 */
export type CreatePostgresCheckpointerOptions = Readonly<{
  /** PostgreSQL 直连或连接池 URL；缺省时读取 `DATABASE_URL`。 */
  connectionString?: string;
  /** 专用于 checkpoint 表的 schema；缺省时读取环境变量或使用 `langgraph`。 */
  schema?: string;
}>;

/**
 * 将 saver 调用映射到固定 `agent-v1` namespace 的适配器。
 *
 * LangGraph 1.x 会把顶层 compiled graph 的运行时 namespace 规范化为空字符串；该适配器在
 * saver 边界恢复产品约定的 `agent-v1`，同时把返回配置映射回调用方 namespace，避免影响
 * LangGraph 内部的恢复与 checkpoint_id 处理。
 */
class AgentNamespaceCheckpointSaver extends BaseCheckpointSaver {
  /**
   * 创建 namespace 适配器并复用底层 saver 的序列化协议。
   *
   * @param delegate - 实际保存 checkpoint 的 Memory/PostgreSQL saver。
   */
  constructor(private readonly delegate: BaseCheckpointSaver) {
    super(delegate.serde);
  }

  /**
   * 将调用方配置映射到固定 Agent namespace。
   *
   * @param config - LangGraph 传入的运行配置。
   * @returns 保留 thread/checkpoint id 且 namespace 固定为 agent-v1 的配置。
   */
  private toStoredConfig(config: RunnableConfig): RunnableConfig {
    return {
      ...config,
      configurable: {
        ...config.configurable,
        checkpoint_ns: AGENT_CHECKPOINT_NAMESPACE,
      },
    };
  }

  /**
   * 把底层 saver 返回配置的 namespace 恢复为 LangGraph 本次调用使用的值。
   *
   * @param config - 含底层 checkpoint_id 的存储配置。
   * @param requestedNamespace - LangGraph 调用适配器时使用的 namespace。
   * @returns 对运行时透明、仍保留 checkpoint_id 的配置。
   */
  private toRuntimeConfig(
    config: RunnableConfig,
    requestedNamespace: string,
  ): RunnableConfig {
    return {
      ...config,
      configurable: {
        ...config.configurable,
        checkpoint_ns: requestedNamespace,
      },
    };
  }

  /**
   * 从固定 Agent namespace 读取最新或指定 checkpoint。
   *
   * @param config - LangGraph 读取配置。
   * @returns namespace 对运行时透明的 checkpoint tuple；不存在时为 undefined。
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const requestedNamespace = config.configurable?.checkpoint_ns ?? "";
    const tuple = await this.delegate.getTuple(this.toStoredConfig(config));
    if (!tuple) return undefined;
    return {
      ...tuple,
      config: this.toRuntimeConfig(tuple.config, requestedNamespace),
      parentConfig: tuple.parentConfig
        ? this.toRuntimeConfig(tuple.parentConfig, requestedNamespace)
        : undefined,
    };
  }

  /**
   * 列出固定 Agent namespace 的 checkpoint 历史。
   *
   * @param config - LangGraph 线程与游标配置。
   * @param options - 可选数量、过滤和 before 游标。
   * @returns namespace 对调用方透明的 checkpoint tuple 异步流。
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const requestedNamespace = config.configurable?.checkpoint_ns ?? "";
    const storedOptions = options?.before
      ? { ...options, before: this.toStoredConfig(options.before) }
      : options;
    for await (const tuple of this.delegate.list(
      this.toStoredConfig(config),
      storedOptions,
    )) {
      yield {
        ...tuple,
        config: this.toRuntimeConfig(tuple.config, requestedNamespace),
        parentConfig: tuple.parentConfig
          ? this.toRuntimeConfig(tuple.parentConfig, requestedNamespace)
          : undefined,
      };
    }
  }

  /**
   * 把 checkpoint 写入固定 Agent namespace。
   *
   * @param config - LangGraph 父 checkpoint 配置。
   * @param checkpoint - 本轮完整 checkpoint。
   * @param metadata - LangGraph 节点与 step 元数据。
   * @param newVersions - 本轮变化的 channel 版本。
   * @returns 保留调用方 runtime namespace 的新 checkpoint 配置。
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const requestedNamespace = config.configurable?.checkpoint_ns ?? "";
    const stored = await this.delegate.put(
      this.toStoredConfig(config),
      checkpoint,
      metadata,
      newVersions,
    );
    return this.toRuntimeConfig(stored, requestedNamespace);
  }

  /**
   * 把节点中间写入保存到固定 Agent namespace。
   *
   * @param config - 写入关联的 checkpoint 配置。
   * @param writes - LangGraph channel 写入集合。
   * @param taskId - 产生写入的节点任务标识。
   */
  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    await this.delegate.putWrites(
      this.toStoredConfig(config),
      writes,
      taskId,
    );
  }

  /**
   * 删除业务线程在全部 namespace 下的 checkpoint。
   *
   * @param threadId - 与业务 sessionId 相同的线程标识。
   */
  async deleteThread(threadId: string): Promise<void> {
    await this.delegate.deleteThread(threadId);
  }
}

/**
 * 为任意 saver 应用固定 Agent checkpoint namespace。
 *
 * @param checkpointer - MemorySaver 或运行时 PostgreSQL saver。
 * @returns 对 LangGraph 顶层 namespace 规范化行为透明的 saver。
 */
export function withAgentCheckpointNamespace(
  checkpointer: BaseCheckpointSaver,
): BaseCheckpointSaver {
  return new AgentNamespaceCheckpointSaver(checkpointer);
}

/**
 * 校验 checkpoint schema 是可安全传给 PostgreSQL saver 的未加引号标识符。
 *
 * @param schema - 来自显式参数或环境变量的 schema 名称。
 * @returns 通过严格格式校验的原始 schema 名称。
 */
export function validateAgentCheckpointSchema(schema: string): string {
  if (!AGENT_CHECKPOINT_SCHEMA_PATTERN.test(schema)) {
    throw new Error(
      "AGENT_CHECKPOINT_SCHEMA must match ^[a-z_][a-z0-9_]*$",
    );
  }
  return schema;
}

/**
 * 解析运行时 checkpoint schema，并拒绝空白、大小写或 SQL 片段。
 *
 * @param explicitSchema - 调用方显式提供的 schema；未提供时读取环境变量。
 * @returns 经过严格格式校验的 schema 名称。
 */
export function resolveAgentCheckpointSchema(explicitSchema?: string): string {
  return validateAgentCheckpointSchema(
    explicitSchema ??
      process.env.AGENT_CHECKPOINT_SCHEMA ??
      DEFAULT_AGENT_CHECKPOINT_SCHEMA,
  );
}

/**
 * 创建供 API/Worker 运行时使用的 PostgreSQL checkpointer。
 *
 * 该工厂故意不调用 `setup()`，避免服务启动或请求路径隐式执行 DDL；首次建表只能通过
 * `setup-checkpoint.ts` 显式命令完成。
 *
 * @param options - 可选连接地址与 schema 覆盖。
 * @returns 尚未执行 setup、可直接用于已有 checkpoint schema 的 saver。
 */
export function createPostgresCheckpointer(
  options: CreatePostgresCheckpointerOptions = {},
): BaseCheckpointSaver {
  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error("DATABASE_URL is required for durable Agent checkpoints");
  }

  return PostgresSaver.fromConnString(connectionString, {
    schema: resolveAgentCheckpointSchema(options.schema),
  });
}

/**
 * 创建 API 运行时 checkpointer；生产环境始终要求 PostgreSQL，开发环境可显式选择内存模式。
 *
 * 内存模式只用于没有本地 PostgreSQL 的开发机，并且必须同时满足非 production 环境与
 * `AGENT_ALLOW_MEMORY_CHECKPOINTER=1`，避免部署环境因漏配连接串而静默失去恢复能力。
 *
 * @returns 已应用固定 Agent namespace 的 PostgreSQL 或内存 checkpointer。
 */
export function createAgentRuntimeCheckpointer(): BaseCheckpointSaver {
  if (process.env.DATABASE_URL?.trim()) {
    return createPostgresCheckpointer();
  }

  const allowMemory = process.env.AGENT_ALLOW_MEMORY_CHECKPOINTER === "1";
  if (process.env.NODE_ENV !== "production" && allowMemory) {
    return withAgentCheckpointNamespace(new MemorySaver());
  }

  throw new Error("DATABASE_URL is required for durable Agent checkpoints");
}
