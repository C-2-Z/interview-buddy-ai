/** 服务启动入口：启动 HTTP 服务器 */
import "./preload.js";
import { serve } from "@hono/node-server";
import app, { port } from "./app.js";
import { installVoiceWebSocket } from "./modules/voice/voice.websocket.js";
import { createModuleLogger } from "./shared/logger/voice-logger.js";

const logger = createModuleLogger("api-server");

const server = serve({
  fetch: app.fetch,
  port,
});


installVoiceWebSocket(server);

logger.success("server_started", { port });
