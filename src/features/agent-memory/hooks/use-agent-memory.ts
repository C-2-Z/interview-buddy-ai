/** Agent Memory Hook：统一缓存授权状态、开关修改和摘要清除。 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAgentMemory, getAgentMemory, updateAgentMemory } from "../api";

const AGENT_MEMORY_KEY = ["agent", "memory"] as const;

/** 提供训练记忆状态及可恢复的授权操作。 */
export function useAgentMemory() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: AGENT_MEMORY_KEY, queryFn: getAgentMemory });
  const update = useMutation({
    mutationFn: updateAgentMemory,
    onSuccess: (value) => queryClient.setQueryData(AGENT_MEMORY_KEY, value),
  });
  const clear = useMutation({
    mutationFn: clearAgentMemory,
    onSuccess: (value) => queryClient.setQueryData(AGENT_MEMORY_KEY, value),
  });
  return {
    ...query,
    setEnabled: update.mutateAsync,
    clear: clear.mutateAsync,
    pending: update.isPending || clear.isPending,
  };
}
