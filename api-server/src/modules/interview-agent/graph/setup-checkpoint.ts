/** 显式初始化 Interview Agent PostgreSQL checkpoint schema 的命令入口。 */
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createModuleLogger } from "../../../shared/logger/voice-logger.js";
import {
  createPostgresCheckpointer,
  resolveAgentCheckpointSchema,
} from "./checkpointer.js";

/** 仓库根目录 `.env` 的绝对路径，不依赖命令执行 cwd。 */
export const AGENT_ROOT_ENV_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../.env",
);

// setup 是独立运维命令，不能依赖 serve.ts 的 preload 副作用。
loadEnv({ path: AGENT_ROOT_ENV_PATH });

const logger = createModuleLogger("agent-checkpoint-setup");

/**
 * 显式执行 LangGraph PostgreSQL saver 的建表/迁移，并始终关闭连接池。
 *
 * @returns setup 完成时解析；连接失败、schema 非法或 DDL 失败时拒绝。
 */
export async function setupAgentCheckpoint(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    logger.warn("agent_checkpoint_setup_skipped", {
      reason: "DATABASE_URL not set - PostgreSQL checkpoint setup unavailable",
    });
    return;
  }
  const checkpointer = createPostgresCheckpointer() as import("@langchain/langgraph-checkpoint-postgres").PostgresSaver;
  try {
    await checkpointer.setup();
    logger.success("agent_checkpoint_setup_completed", {
      schema: resolveAgentCheckpointSchema(),
    });
  } finally {
    await checkpointer.end();
  }
}

/**
 * 判断当前模块是否由 tsx/node 直接执行，避免普通 import 隐式运行 DDL。
 *
 * @returns 仅当 argv 入口与本模块绝对路径相同时返回 true。
 */
function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  return Boolean(
    entryPath && resolve(entryPath) === resolve(fileURLToPath(import.meta.url)),
  );
}

if (isDirectExecution()) {
  void setupAgentCheckpoint().catch((error: unknown) => {
    const setupError =
      error instanceof Error ? error : new Error("Unknown checkpoint setup error");
    logger.error(setupError, { event: "agent_checkpoint_setup_failed" });
    process.exitCode = 1;
  });
}
