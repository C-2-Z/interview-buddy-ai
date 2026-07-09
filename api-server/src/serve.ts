import "./preload.js";
import { serve } from "@hono/node-server";
import app, { port } from "./app.js";
import { installVoiceWebSocket } from "./modules/voice/voice.websocket.js";

const server = serve({
  fetch: app.fetch,
  port,
});

installVoiceWebSocket(server);

console.log(`🚀 API server running on http://localhost:${port}`);
