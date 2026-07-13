/** Interview lifecycle HTTP 路由：提供状态动作与整场删除入口。 */
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { createInterviewLifecycleRepository } from "./interview-lifecycle.repository.js";
import {
  InterviewLifecycleActionSchema,
  InterviewLifecycleParamsSchema,
} from "./interview-lifecycle.schemas.js";
import {
  InterviewLifecycleService,
  InterviewLifecycleServiceError,
} from "./interview-lifecycle.service.js";

const logger = createModuleLogger("interview-lifecycle-routes");
const interviewLifecycleRoutes = new Hono<{ Variables: AuthVariables }>();

interviewLifecycleRoutes.use("*", requireAuth);

/** 将生命周期错误映射为稳定响应，绝不回传原始数据库错误或堆栈。 */
interviewLifecycleRoutes.onError((error, context) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return context.json(
      { error: "请求参数无效。", code: "lifecycle_invalid_request", retryable: false },
      400,
    );
  }
  if (error instanceof InterviewLifecycleServiceError) {
    const body = { error: error.message, code: error.code, retryable: error.retryable };
    return error.statusCode === 409 ? context.json(body, 409) : context.json(body, 503);
  }
  logger.error(new Error("Unhandled interview lifecycle route error"), {
    method: context.req.method,
    path: context.req.path,
  });
  return context.json(
    {
      error: "面试生命周期服务暂时不可用，请重试。",
      code: "lifecycle_internal_error",
      retryable: true,
    },
    500,
  );
});

/** 暂停、恢复、提前结束或放弃当前 Agent 会话。 */
interviewLifecycleRoutes.post("/sessions/:sessionId/lifecycle", async (context) => {
  const { sessionId } = InterviewLifecycleParamsSchema.parse(context.req.param());
  const { action } = InterviewLifecycleActionSchema.parse(
    await context.req.json().catch(() => ({})),
  );
  const service = new InterviewLifecycleService({
    repository: createInterviewLifecycleRepository(context.var.supabase),
  });
  return context.json(await service.transition(sessionId, action));
});

/** 删除整场 Agent 会话及其业务数据，并尽力同步清理 checkpoint。 */
interviewLifecycleRoutes.delete("/sessions/:sessionId", async (context) => {
  const { sessionId } = InterviewLifecycleParamsSchema.parse(context.req.param());
  const service = new InterviewLifecycleService({
    repository: createInterviewLifecycleRepository(context.var.supabase),
  });
  return context.json(await service.deleteSession(sessionId));
});

export { interviewLifecycleRoutes };
