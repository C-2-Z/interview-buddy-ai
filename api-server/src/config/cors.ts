/** CORS 跨域配置 */
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

export const corsMiddleware: MiddlewareHandler = cors({
  origin: [
    "https://ezmock.site",
    "https://www.ezmock.site",
    "http://localhost:3000",
  ],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false,
});

