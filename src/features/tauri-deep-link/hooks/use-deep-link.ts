/** Tauri 深链监听 Hook：注册深链事件并提取 auth callback 参数。 */
import { useEffect } from "react";
import { isTauri } from "@/shared/platform/env-detect";
import type { DeepLinkPayload } from "../types";

/** 深链事件的处理回调类型。 */
export type DeepLinkHandler = (payload: DeepLinkPayload) => void;

/**
 * 注册 Tauri 深链事件监听器。
 * 仅在 Tauri 平台初始化时调用一次，监听 interviewbuddy:// 协议的深链回调。
 *
 * @param onDeepLink - 收到深链时触发的回调函数。
 * @param deps - 可选的依赖数组，默认仅在挂载时注册。
 */
export function useDeepLink(onDeepLink: DeepLinkHandler, deps: React.DependencyList = []) {
  useEffect(() => {
    if (typeof window === "undefined" || !isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    /** 冷启动与运行中 URL 都通过同一安全处理器逐个派发。 */
    const emitUrls = (urls: string[] | null) => {
      if (disposed || !urls) return;
      for (const url of urls) onDeepLink({ url });
    };

    void import("@tauri-apps/plugin-deep-link").then(async ({ getCurrent, onOpenUrl }) => {
      emitUrls(await getCurrent());
      unlisten = await onOpenUrl(emitUrls);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
