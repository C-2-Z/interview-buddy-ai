import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sessions } from "./routes/sessions.js";
import { questions } from "./routes/questions.js";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

app.route("/api/sessions", sessions);
app.route("/api/questions", questions);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3001;

// Use @hono/node-server when running with tsx / node
// For Bun/Deno, the native serve API would be used.
// This file imports the adapter lazily so it works across runtimes.
export default app;
export { port };
