/** 知识库模块：单个 QA 会话详情 Hook */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQaSession, updateQaSession, deleteQaSession } from "../api";
import { QA_SESSIONS_KEY } from "./use-qa-sessions";

/** 获取单个 QA 会话详情（含消息） */
export function useQaSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["knowledge", "qa", "session", sessionId],
    queryFn: () => getQaSession(sessionId!),
    enabled: !!sessionId,
  });
}

/** 更新 QA 会话 Mutation */
export function useUpdateQaSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { id: string; title?: string; documentIds?: string[] }) =>
      updateQaSession(params.id, { title: params.title, documentIds: params.documentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QA_SESSIONS_KEY });
    },
  });
}

/** 删除 QA 会话 Mutation */
export function useDeleteQaSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => deleteQaSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QA_SESSIONS_KEY });
    },
  });
}
