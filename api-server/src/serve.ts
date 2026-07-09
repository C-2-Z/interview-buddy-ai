import "./preload.js";
import { serve } from "@hono/node-server";
import app, { port } from "./app.js";
import { runCleanup } from "./modules/cleanup/cleanup.service.js";

serve({
  fetch: app.fetch,
  port,
});

// Register cleanup timer: check every 30 seconds
runCleanup(); // run once on startup
setInterval(runCleanup, 30_000);

console.log(`🚀 API server running on http://localhost:${port}`);
