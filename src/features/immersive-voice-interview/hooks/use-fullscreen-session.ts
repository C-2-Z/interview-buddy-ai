/** immersive-voice-interview：全屏请求、系统退出与安全降级。 */
import { useCallback, useEffect, useState } from "react";

/** 管理浏览器全屏；拒绝时页面仍保持 full-viewport 可用。 */
export function useFullscreenSession() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported =
    typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen);

  useEffect(() => {
    /** 同步浏览器或用户主动退出全屏后的真实状态。 */
    function sync() {
      setActive(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /** 在用户手势内请求全屏；失败只记录弱提示，不阻断面试。 */
  const request = useCallback(async (): Promise<boolean> => {
    if (!document.documentElement.requestFullscreen) return false;
    try {
      await document.documentElement.requestFullscreen();
      setError(null);
      return true;
    } catch {
      setError("浏览器未进入全屏，面试将继续使用沉浸式全窗口模式。 ");
      return false;
    }
  }, []);

  /** 页面完成或退出时归还浏览器全屏。 */
  const exit = useCallback(async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      setError("浏览器暂时无法退出全屏，请按 Esc。 ");
    }
  }, []);

  return { supported, active, error, request, exit };
}
