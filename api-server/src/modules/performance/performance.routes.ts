/** 性能模块：暴露受认证保护的观测健康状态。 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";
import { getPerformanceStatus } from "./performance.service.js";

const performanceRoutes = new Hono<{ Variables: AuthVariables }>();
performanceRoutes.use("*", requireAuth);

/** 返回性能日志能力及其有效采样率。 */
performanceRoutes.get("/health", (c) => c.json(getPerformanceStatus()));

export { performanceRoutes };
