/** Tauri 深链监听 Hook：注册深链事件并提取 auth callback 参数。 */
import { useEffect } from "react";
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
export function useDeepLink(_onDeepLink: DeepLinkHandler, deps: React.DependencyList = []) {
  useEffect(() => {
    // Tauri 深链插件注入：@tauri-apps/plugin-deep-link
    // 当前为预留骨架，实际集成 OAuth 时替换为：
    // import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
    // const unlisten = await onOpenUrl((urls) => { onDeepLink({ url: urls[0] }) });
    // return () => { unlisten(); };

    if (typeof window === "undefined") return;

    // 监听 Tauri 原生事件（当前为占位，待集成实际插件后启用）
    const cleanup = () => {
      // 取消监听的占位
    };

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
