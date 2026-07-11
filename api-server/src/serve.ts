/** 服务启动入口：启动 HTTP 服务器 */
import "./preload.js";
import { serve } from "@hono/node-server";
import app, { port } from "./app.js";
import { runCleanup } from "./modules/cleanup/cleanup.service.js";
import { installVoiceWebSocket } from "./modules/voice/voice.websocket.js";
import { createModuleLogger } from "./modules/voice/voice-logger.js";

const logger = createModuleLogger("api-server");

const server = serve({
  fetch: app.fetch,
  port,
});

// Register cleanup timer: check every 30 seconds
runCleanup();
setInterval(runCleanup, 30_000);

installVoiceWebSocket(server);

logger.success("server_started", { port });
