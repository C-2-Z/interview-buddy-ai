/** 知识库模块：获取文档列表 Hook */

import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "../api";

const KNOWLEDGE_QUERY_KEY = ["knowledge", "documents"] as const;

/** 获取知识库文档列表 */
export function useKnowledgeList() {
  return useQuery({
    queryKey: KNOWLEDGE_QUERY_KEY,
    queryFn: () => listDocuments(),
  });
}

/** Query key 导出（方便 invalidation） */
export { KNOWLEDGE_QUERY_KEY };
