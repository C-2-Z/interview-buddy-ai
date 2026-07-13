/** 知识库模块：上传文档 Hook */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadDocument } from "../api";
import { KNOWLEDGE_QUERY_KEY } from "./use-knowledge-list";
import type { DocFileType } from "../types";

/** 上传文档 Mutation */
export function useKnowledgeUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      title: string;
      content: string;
      fileName?: string;
      fileType: DocFileType;
      fileSize?: number;
      fileHash?: string;
    }) => uploadDocument(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
    },
  });
}
