/** Hono 服务入口：路由注册、中间件、CORS */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { corsMiddleware } from "./config/cors.js";
import { bank } from "./modules/bank/bank.routes.js";
import { questions } from "./modules/questions/questions.routes.js";
import { sessions } from "./modules/sessions/sessions.routes.js";
import { settings } from "./modules/settings/settings.routes.js";
import { skills } from "./modules/skills/skills.routes.js";
import { resumes } from "./modules/resumes/resumes.routes.js";
import { voice } from "./modules/voice/voice.routes.js";

const app = new Hono();

/** 全局错误处理：记录错误详情并返回统一格式 */
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.path}`, err);
  return c.json({ error: "服务器内部错误" }, 500);
});

app.use("*", corsMiddleware);
app.use("*", logger());

app.route("/api/sessions", sessions);
app.route("/api/questions", questions);
app.route("/api/bank", bank);
app.route("/api/settings", settings);
app.route("/api/skills", skills);
app.route("/api/resumes", resumes);
app.route("/api/voice", voice);

app.get("/api/health", (c) => c.json({ status: "ok" }));

export const port = Number(process.env.PORT) || 3001;
export default app;
