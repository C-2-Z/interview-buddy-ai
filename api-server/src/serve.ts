/** 服务启动入口：启动 HTTP 服务器 */
import "./preload.js";
import { serve } from "@hono/node-server";
import { setupAgentCheckpoint } from "./modules/interview-agent/graph/setup-checkpoint.js";
import app, { port } from "./app.js";
import { installVoiceWebSocket } from "./modules/voice/voice.websocket.js";
import { createModuleLogger } from "./shared/logger/voice-logger.js";

const logger = createModuleLogger("api-server");

// 初始化 Agent 面试恢复的 PostgreSQL checkpoint 表（CREATE SCHEMA IF NOT EXISTS / CREATE TABLE IF NOT EXISTS，
// 幂等安全）。首次部署或 schema 尚未创建时自动建表；失败不阻止服务器启动，readiness 检查会暴露阻断码。
setupAgentCheckpoint().catch((error: unknown) => {
  const setupError = error instanceof Error ? error : new Error("Checkpoint setup failed");
  logger.error(setupError, { event: "bootstrap_checkpoint_setup_failed" });
});

const server = serve({
  fetch: app.fetch,
  port,
});


installVoiceWebSocket(server);

logger.success("server_started", { port });
