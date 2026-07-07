import "./preload.js";
import { serve } from "@hono/node-server";
import app, { port } from "./index.js";

serve({
  fetch: app.fetch,
  port,
});
console.log(`🚀 API server running on http://localhost:${port}`);
