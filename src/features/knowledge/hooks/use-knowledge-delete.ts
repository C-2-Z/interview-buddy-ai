/** 知识库模块：删除文档 Hook */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDocument } from "../api";
import { KNOWLEDGE_QUERY_KEY } from "./use-knowledge-list";

/** 删除文档 Mutation */
export function useKnowledgeDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
    },
  });
}
