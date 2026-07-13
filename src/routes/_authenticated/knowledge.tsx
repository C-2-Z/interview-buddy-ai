/** 路由文件：知识库页面 — 薄入口，只做路由注册 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { KnowledgeBasePage } from "../../features/knowledge/components/knowledge-base-page";

export const Route = createFileRoute("/_authenticated/knowledge")({
  component: KnowledgeBasePage,
  validateSearch: z.object({
    tab: z.enum(["documents", "qa", "graph"]).catch("documents"),
  }),
});
