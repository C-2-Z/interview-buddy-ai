/** API CORS 跨域配置：仅允许生产站点与仓库约定的本地开发端口。 */
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

export const corsMiddleware: MiddlewareHandler = cors({
  origin: [
    "https://ezmock.site",
    "https://www.ezmock.site",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
  credentials: false,
});

