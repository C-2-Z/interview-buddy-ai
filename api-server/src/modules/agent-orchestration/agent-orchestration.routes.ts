/** Agent Orchestration 只读 HTTP API：返回不含思维链的行动记录。 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { createInterviewAgentRepository } from "../interview-agent/interview-agent.repository.js";
import { createAgentOrchestrationRepository } from "./agent-orchestration.repository.js";
import { AgentActivitiesParamsSchema } from "./agent-orchestration.schemas.js";

const logger = createModuleLogger("agent-orchestration-routes");
const agentOrchestrationRoutes = new Hono<{ Variables: AuthVariables }>();
agentOrchestrationRoutes.use("*", requireAuth);
agentOrchestrationRoutes.onError((error, context) => {
  if (error instanceof z.ZodError) return context.json({ error: "请求参数无效", code: "agent_orchestration_invalid_request", retryable: false }, 400);
  logger.error(error instanceof Error ? error : new Error("Agent orchestration route failed"), { path: context.req.path });
  return context.json({ error: "Agent 行动记录暂时不可用", code: "agent_orchestration_unavailable", retryable: true }, 503);
});

/** 所有权验证后返回用户可见行动，不返回 Prompt、原始工具结果或思维链。 */
agentOrchestrationRoutes.get("/sessions/:sessionId/activities", async (context) => {
  const { sessionId } = AgentActivitiesParamsSchema.parse(context.req.param());
  await createInterviewAgentRepository(context.var.supabase).getOwnedSessionProjection(sessionId);
  return context.json({ activities: await createAgentOrchestrationRepository(context.var.supabase).listActivities(sessionId) });
});

export { agentOrchestrationRoutes };
