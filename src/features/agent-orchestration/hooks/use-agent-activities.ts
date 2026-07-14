/** Agent 活动 Hook：为独立时间线提供轮询恢复能力。 */
import { useQuery } from "@tanstack/react-query";
import { getAgentActivities } from "../api";

/** 读取会话活动；SSE 离线时短轮询仍可恢复最新进展。 */
export function useAgentActivities(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: ["agent", "activities", sessionId],
    queryFn: () => getAgentActivities(sessionId),
    enabled: enabled && Boolean(sessionId),
    refetchInterval: enabled ? 5_000 : false,
  });
}
