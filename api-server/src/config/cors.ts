/** API CORS 跨域配置：仅允许生产站点、开发端口与显式声明的原生壳 origin。 */
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

/** Web 生产站点与仓库约定的本地开发 origin。 */
export const DEFAULT_CORS_ORIGINS = [
  "https://ezmock.site",
  "https://www.ezmock.site",
  "http://localhost:3000",
  "http://localhost:5173",
] as const;

/**
 * 合并默认 origin 与部署环境显式配置，并拒绝会放宽全部来源的值。
 *
 * @param configuredOrigins - 逗号分隔的 Capacitor/Tauri 或额外 Web origin。
 * @returns 去重后的精确 CORS 白名单。
 */
export function resolveAllowedOrigins(configuredOrigins?: string): string[] {
  const additional = (configuredOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  for (const origin of additional) {
    if (origin === "*") throw new Error("CORS_ALLOWED_ORIGINS 不允许使用通配符");
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ALLOWED_ORIGINS 包含无效 origin: ${origin}`);
    }
    if (!["http:", "https:", "tauri:", "capacitor:"].includes(url.protocol)) {
      throw new Error(`CORS_ALLOWED_ORIGINS 包含不支持的协议: ${url.protocol}`);
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    ) {
      throw new Error(`CORS_ALLOWED_ORIGINS 必须只包含 origin: ${origin}`);
    }
  }

  return [...new Set([...DEFAULT_CORS_ORIGINS, ...additional])];
}

/** 当前 API 进程生效的精确 CORS 白名单。 */
export const allowedCorsOrigins = resolveAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

export const corsMiddleware: MiddlewareHandler = cors({
  origin: allowedCorsOrigins,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
  credentials: false,
});
