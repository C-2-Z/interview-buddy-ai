/** interview-hub - 面试中心数据 */
import { useCallback, useEffect, useState } from "react";
import { listRecentInterviews } from "../api";
import type { RecentInterview } from "../types";

export function useInterviewHub() {
  const [sessions, setSessions] = useState<RecentInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions((await listRecentInterviews()).slice(0, 10));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载最近面试失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
