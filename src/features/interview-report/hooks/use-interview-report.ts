/** Interview report Hook：管理报告加载、刷新和稳定错误提示。 */
import { useCallback, useEffect, useState } from "react";
import { getInterviewReport } from "../api";
import type { InterviewReport } from "../types";

/** 加载独立报告页所需数据；失败时保留明确重试入口。 */
export function useInterviewReport(sessionId: string) {
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 重新读取服务器已冻结的只读报告投影。 */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getInterviewReport(sessionId));
    } catch {
      setError("报告加载失败，请重试；若仍无法打开请联系管理员。");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { report, loading, error, refresh };
}
