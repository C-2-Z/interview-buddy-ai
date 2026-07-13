/** Hono 服务入口：路由注册、中间件、CORS */
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { corsMiddleware } from "./config/cors.js";
import { bank } from "./modules/bank/bank.routes.js";
import { settings } from "./modules/settings/settings.routes.js";
import { skills } from "./modules/skills/skills.routes.js";
import { resumes } from "./modules/resumes/resumes.routes.js";
import { performanceRoutes } from "./modules/performance/performance.routes.js";
import { interviewAgentRoutes } from "./modules/interview-agent/interview-agent.routes.js";
import { agentReadinessRoutes } from "./modules/agent-readiness/agent-readiness.routes.js";
import { interviewLifecycleRoutes } from "./modules/interview-lifecycle/interview-lifecycle.routes.js";
import { sessions } from "./modules/sessions/sessions.routes.js";
import { createModuleLogger } from "./shared/logger/voice-logger.js";

const app = new Hono();
const appLogger = createModuleLogger("api-server");

/** 全局错误处理：记录错误详情并返回统一格式 */
app.onError((err, c) => {
  appLogger.error(err, { method: c.req.method, path: c.req.path });
  return c.json({ error: "服务器内部错误" }, 500);
});

app.use("*", corsMiddleware);
app.use("*", honoLogger());

app.route("/api/bank", bank);
app.route("/api/settings", settings);
app.route("/api/skills", skills);
app.route("/api/resumes", resumes);
app.route("/api/performance", performanceRoutes);
app.route("/api/sessions", sessions);
app.route("/api/agent/readiness", agentReadinessRoutes);
app.route("/api/agent", interviewLifecycleRoutes);
app.route("/api/agent", interviewAgentRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

export const port = Number(process.env.PORT) || 3001;
export default app;
