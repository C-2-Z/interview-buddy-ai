import { createMiddleware } from "hono/factory";
import { createUserClient } from "../lib/supabase.js";

/**
 * Hono middleware: verifies the Bearer token via Supabase Auth,
 * then injects `userId` and an authenticated `supabase` client into context.
 */
export const requireAuth = createMiddleware<{
  Variables: { userId: string; supabase: ReturnType<typeof createUserClient> };
}>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "未提供认证凭证" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token || token.split(".").length !== 3) {
    return c.json({ error: "无效的认证凭证" }, 401);
  }

  const supabase = createUserClient(token);

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return c.json({ error: "认证验证失败" }, 401);
  }

  c.set("userId", data.claims.sub);
  c.set("supabase", supabase);
  await next();
});
