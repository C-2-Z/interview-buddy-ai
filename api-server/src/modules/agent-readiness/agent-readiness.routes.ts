/** Agent readiness 模块的鉴权只读路由与脱敏错误边界。 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { createAgentReadinessRepository } from "./agent-readiness.repository.js";
import { AgentReadinessQuerySchema } from "./agent-readiness.schemas.js";
import { createAgentReadinessService } from "./agent-readiness.service.js";

const logger = createModuleLogger("agent-readiness-routes");
const agentReadinessRoutes = new Hono<{ Variables: AuthVariables }>();
agentReadinessRoutes.use("*", requireAuth);

/** 未知探测错误只记录稳定上下文，不记录原始数据库错误或凭据。 */
agentReadinessRoutes.onError((error, context) => {
  if (error instanceof z.ZodError)
    return context.json({ error: "检查参数无效", code: "readiness_invalid_request" }, 400);
  logger.error(new Error("Agent readiness check failed"), {
    method: context.req.method,
    path: context.req.path,
  });
  return context.json(
    { error: "暂时无法完成开始前检查", code: "readiness_check_failed", retryable: true },
    503,
  );
});

/** 返回当前用户和创建方案的脱敏 readiness 状态。 */
agentReadinessRoutes.get("/", async (context) => {
  const query = AgentReadinessQuerySchema.parse(context.req.query());
  const repository = createAgentReadinessRepository(context.var.supabase);
  const service = createAgentReadinessService(context.var.supabase, context.var.userId, repository);
  return context.json(await service.check(query));
});

export { agentReadinessRoutes };
