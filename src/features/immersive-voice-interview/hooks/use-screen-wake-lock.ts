/** immersive-voice-interview：在支持的浏览器中保持面试期间屏幕唤醒。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { platformAdapter, type WakeLockSentinelLike } from "@/shared/platform/platform-adapter";

/** 面试房间可见时请求屏幕唤醒，不支持或被拒绝时静默降级。 */
export function useScreenWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [active, setActive] = useState(false);

  /** 尝试获取一次屏幕唤醒锁。 */
  const acquire = useCallback(async () => {
    if (!enabled || platformAdapter.display.getVisibilityState() !== "visible") return;
    if (sentinelRef.current && !sentinelRef.current.released) return;
    try {
      const sentinel = await platformAdapter.display.requestWakeLock();
      if (!sentinel) return;
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
      if (platformAdapter.display.getVisibilityState() === "visible") void acquire();
    }
    const unsubscribe = platformAdapter.display.onVisibilityChange(onVisibilityChange);
    return () => {
      unsubscribe();
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [acquire]);

  return { active };
}
