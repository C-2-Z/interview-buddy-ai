import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../../shared/auth/require-auth.js";

const performanceRoutes = new Hono<{ Variables: AuthVariables }>();
performanceRoutes.use("*", requireAuth);
performanceRoutes.get("/health", (c) =>
  c.json({ enabled: true, sampleRate: Number(process.env.PERFORMANCE_SAMPLE_RATE || "1") }),
);

export { performanceRoutes };
