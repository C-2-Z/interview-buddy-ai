/** interview-history - 面试报告详情 */
import { useCallback, useEffect, useState } from "react";
import { getInterviewReport } from "../api";
import type { InterviewReport } from "../types";

export function useInterviewReport(sessionId: string) {
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getInterviewReport(sessionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载面试报告失败");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { report, loading, error, refresh };
}
