/** Hono 服务入口：路由注册、中间件、CORS */
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { corsMiddleware } from "./config/cors.js";
import { bank } from "./modules/bank/bank.routes.js";
import { settings } from "./modules/settings/settings.routes.js";
import { skills } from "./modules/skills/skills.routes.js";
import { resumes } from "./modules/resumes/resumes.routes.js";
import { performanceRoutes } from "./modules/performance/performance.routes.js";
import { sessions } from "./modules/sessions/sessions.routes.js";
import { createModuleLogger } from "./shared/logger/voice-logger.js";
import { createLazyRoute } from "./shared/http/lazy-route.js";

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
app.route(
  "/api/agent",
  createLazyRoute(async () => {
    const [readiness, lifecycle, memory, orchestration, interview] = await Promise.all([
      import("./modules/agent-readiness/agent-readiness.routes.js"),
      import("./modules/interview-lifecycle/interview-lifecycle.routes.js"),
      import("./modules/agent-memory/agent-memory.routes.js"),
      import("./modules/agent-orchestration/agent-orchestration.routes.js"),
      import("./modules/interview-agent/interview-agent.routes.js"),
    ]);
    const routes = new Hono();
    routes.route("/readiness", readiness.agentReadinessRoutes);
    routes.route("/memory", memory.agentMemoryRoutes);
    routes.route("/", lifecycle.interviewLifecycleRoutes);
    routes.route("/", orchestration.agentOrchestrationRoutes);
    routes.route("/", interview.interviewAgentRoutes);
    return routes;
  }),
);
app.route(
  "/api/knowledge",
  createLazyRoute(async () => (await import("./modules/knowledge/knowledge.routes.js")).knowledge),
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

/** OpenAPI 文档端点仅在访问文档时加载目录与 Swagger UI。 */
app.get("/api/openapi.json", async (context) => {
  const { CURRENT_OPENAPI_DOC } = await import("./config/openapi-current.js");
  return context.json(CURRENT_OPENAPI_DOC);
});
app.get("/api/docs", async (context, next) => {
  const { swaggerUI } = await import("@hono/swagger-ui");
  return swaggerUI({ url: "/api/openapi.json" })(context, next);
});

export const port = Number(process.env.PORT) || 3001;
export default app;
