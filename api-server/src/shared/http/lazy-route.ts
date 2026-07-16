/** HTTP 共享模块：按首次请求惰性加载并缓存 Hono 子路由。 */
import { Hono, type Env } from "hono";

/**
 * 创建一个在首次请求时加载目标 Hono 应用的代理路由。
 *
 * @param loadRoute - 返回目标 Hono 应用的动态加载函数。
 * @returns 可通过 `app.route()` 挂载的惰性代理路由。
 */
export function createLazyRoute<RouteEnv extends Env>(
  loadRoute: () => Promise<Hono<RouteEnv>>,
): Hono<RouteEnv> {
  let routePromise: Promise<Hono<RouteEnv>> | null = null;
  const lazyRoute = new Hono<RouteEnv>();

  lazyRoute.all("*", async (context) => {
    try {
      routePromise ??= loadRoute();
      const route = await routePromise;
      return route.fetch(context.req.raw, context.env);
    } catch (error) {
      // 失败的 import Promise 不可永久缓存，否则瞬时故障会使模块持续不可用。
      routePromise = null;
      throw error;
    }
  });

  return lazyRoute;
}
