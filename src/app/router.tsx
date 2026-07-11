/** TanStack Router 初始化 */
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";

/**
 * 获取 router
 * @returns 
 */
export const getRouter = () => {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};

