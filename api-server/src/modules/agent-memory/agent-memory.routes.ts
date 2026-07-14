/** Agent Memory HTTP API：读取授权、更新开关和清除脱敏摘要。 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { createAgentMemoryRepository } from "./agent-memory.repository.js";
import { UpdateAgentMemorySchema } from "./agent-memory.schemas.js";
import { AgentMemoryService } from "./agent-memory.service.js";

const logger = createModuleLogger("agent-memory-routes");
const agentMemoryRoutes = new Hono<{ Variables: AuthVariables }>();
agentMemoryRoutes.use("*", requireAuth);

/** 将未知存储错误转换为不泄露数据库细节的稳定响应。 */
agentMemoryRoutes.onError((error, context) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return context.json({ error: "请求参数无效", code: "agent_memory_invalid_request", retryable: false }, 400);
  }
  logger.error(error instanceof Error ? error : new Error("Agent memory route failed"), { path: context.req.path });
  return context.json({ error: "训练记忆暂时不可用", code: "agent_memory_unavailable", retryable: true }, 503);
});

/** 构造绑定当前请求用户的 Memory Service。 */
function service(context: { var: AuthVariables }): AgentMemoryService {
  return new AgentMemoryService(createAgentMemoryRepository(context.var.supabase));
}

agentMemoryRoutes.get("/", async (context) => context.json(await service(context).get(context.var.userId)));
agentMemoryRoutes.patch("/", async (context) => {
  const input = UpdateAgentMemorySchema.parse(await context.req.json().catch(() => ({})));
  return context.json(await service(context).setEnabled(context.var.userId, input.enabled));
});
agentMemoryRoutes.delete("/", async (context) => context.json(await service(context).clear(context.var.userId)));

export { agentMemoryRoutes };
