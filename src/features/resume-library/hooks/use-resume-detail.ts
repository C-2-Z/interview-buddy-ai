/** resume-library - 简历详情 */
import { useCallback, useEffect, useState } from "react";
import { getResume } from "../api";
import type { ResumeDetail } from "../types";

export function useResumeDetail(resumeId: string) {
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResume(await getResume(resumeId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载简历详情失败");
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { resume, loading, error, refresh };
}
