/** immersive-voice-interview：在支持的浏览器中保持面试期间屏幕唤醒。 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Wake Lock API 的最小浏览器契约。 */
type WakeLockSentinelLike = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
};

/** 面试房间可见时请求屏幕唤醒，不支持或被拒绝时静默降级。 */
export function useScreenWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [active, setActive] = useState(false);

  /** 尝试获取一次屏幕唤醒锁。 */
  const acquire = useCallback(async () => {
    if (!enabled || document.visibilityState !== "visible") return;
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!wakeLock || (sentinelRef.current && !sentinelRef.current.released)) return;
    try {
      const sentinel = await wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setActive(true);
      sentinel.addEventListener("release", () => setActive(false));
    } catch {
      setActive(false);
    }
  }, [enabled]);

  useEffect(() => {
    void acquire();
    /** 从后台返回时浏览器会释放旧锁，需要重新申请。 */
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [acquire]);

  return { active };
}
