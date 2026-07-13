/** 知识库模块：QA 会话列表 Hook */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listQaSessions, createQaSession } from "../api";

const QA_SESSIONS_KEY = ["knowledge", "qa", "sessions"] as const;

/** 获取 QA 会话列表 */
export function useQaSessions() {
  return useQuery({
    queryKey: QA_SESSIONS_KEY,
    queryFn: () => listQaSessions(),
  });
}

/** 创建 QA 会话 Mutation */
export function useCreateQaSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { title?: string; documentIds?: string[] }) => createQaSession(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QA_SESSIONS_KEY });
    },
  });
}

export { QA_SESSIONS_KEY };
