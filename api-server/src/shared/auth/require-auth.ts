/** JWT 认证中间件 */
import { createMiddleware } from "hono/factory";
import {
  createUserClient,
  type UserSupabaseClient,
} from "../db/supabase.js";

export type AuthVariables = {
  userId: string;
  supabase: UserSupabaseClient;
};

export const requireAuth = createMiddleware<{
  Variables: AuthVariables;
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

