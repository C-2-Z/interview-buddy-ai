/** 知识库模块：知识图谱数据 Hook */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGraphData, getBacklinks, rebuildGraph } from "../api";

const GRAPH_DATA_KEY = ["knowledge", "graph"] as const;

/** 获取图谱数据 */
export function useKnowledgeGraph(params?: {
  minSimilarity?: number;
  documentIds?: string[];
}) {
  return useQuery({
    queryKey: [...GRAPH_DATA_KEY, params],
    queryFn: () => getGraphData(params),
  });
}

/** 获取 chunk 的反链 */
export function useBacklinks(chunkId: string | null, minSimilarity?: number) {
  return useQuery({
    queryKey: ["knowledge", "graph", "backlinks", chunkId, minSimilarity],
    queryFn: () => getBacklinks(chunkId!, minSimilarity),
    enabled: !!chunkId,
  });
}

/** 重建图边 Mutation */
export function useRebuildGraph() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rebuildGraph(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRAPH_DATA_KEY });
    },
  });
}

export { GRAPH_DATA_KEY };
