/**
 * 知识库模块：知识库搜索 Hook — 直接搜索 chunks，不调 LLM
 */

import { useMutation } from "@tanstack/react-query";
import { searchKnowledgeAPI } from "../api";

/** 搜索知识库 Mutation */
export function useKnowledgeSearch() {
  return useMutation({
    mutationFn: (params: { query: string; documentIds?: string[]; topK?: number }) =>
      searchKnowledgeAPI(params),
  });
}
