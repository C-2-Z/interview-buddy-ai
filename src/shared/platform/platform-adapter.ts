/** 平台适配边界：集中封装 Web、Android WebView 与 WebView2 的设备能力入口。 */
import { runtimeConfig, type AppTarget } from "@/shared/runtime/runtime-config";
import { isTauri } from "./env-detect";
import { createTauriPlatformAdapter } from "./tauri-adapter";

/** Wake Lock API 的最小跨端契约。 */
export type WakeLockSentinelLike = {
  /** 锁是否已经由系统释放。 */ released: boolean;
  /** 主动归还屏幕唤醒锁。 */ release(): Promise<void>;
  /** 监听系统释放事件。 */ addEventListener(type: "release", listener: () => void): void;
};

/** 麦克风和实时音频能力。 */
export type VoicePlatformAdapter = Readonly<{
  /** 当前上下文是否允许安全媒体采集。 */ isSecureContext: () => boolean;
  /** 当前 WebView 是否暴露麦克风采集 API。 */ isMicrophoneSupported: () => boolean;
  /** 枚举浏览器允许查看的媒体设备。 */ enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  /** 查询麦克风授权状态；不支持查询时返回 undefined。 */ queryMicrophonePermission: () => Promise<
    PermissionState | undefined
  >;
  /** 请求指定约束的麦克风流。 */ requestMicrophone: (
    constraints: MediaTrackConstraints,
  ) => Promise<MediaStream>;
  /** 创建用于采集或播放的 Web Audio 上下文。 */ createAudioContext: () => AudioContext;
}>;

/** 全屏、可见性与屏幕常亮能力。 */
export type DisplayPlatformAdapter = Readonly<{
  /** 当前环境是否支持程序化全屏。 */ isFullscreenSupported: () => boolean;
  /** 当前窗口是否处于程序化全屏。 */ isFullscreenActive: () => boolean;
  /** 请求当前应用内容进入全屏。 */ requestFullscreen: () => Promise<void>;
  /** 退出程序化全屏。 */ exitFullscreen: () => Promise<void>;
  /** 订阅全屏状态变化并返回取消函数。 */ onFullscreenChange: (listener: () => void) => () => void;
  /** 返回当前页面可见性。 */ getVisibilityState: () => DocumentVisibilityState;
  /** 订阅前后台可见性变化并返回取消函数。 */ onVisibilityChange: (
    listener: () => void,
  ) => () => void;
  /** 请求屏幕唤醒锁；平台不支持时返回 null。 */ requestWakeLock: () => Promise<WakeLockSentinelLike | null>;
}>;

/** 所有业务 feature 共用的平台适配器。 */
export type PlatformAdapter = Readonly<{
  /** 当前构建目标。 */ target: AppTarget;
  /** 返回 Supabase 会话默认使用的持久存储。 */ getAuthStorage: () => Storage | undefined;
  /** 返回当前页面 origin；SSR 时为空字符串。 */ getCurrentOrigin: () => string;
  /** 创建实时语音 WebSocket。 */ createWebSocket: (url: string) => WebSocket;
  /** 麦克风和音频能力。 */ voice: VoicePlatformAdapter;
  /** 窗口和屏幕能力。 */ display: DisplayPlatformAdapter;
}>;

/** 返回安全可用的 window，SSR 或受限 WebView 中返回 undefined。 */
function getWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** 返回安全可用的 document，SSR 中返回 undefined。 */
function getDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

/**
 * 创建标准浏览器/WebView 平台实现；Native 插件接入时只需替换这一边界。
 *
 * @param target - 构建系统确定的 web 或 native 目标。
 * @returns 使用标准 Web API 且在 SSR 中安全降级的平台适配器。
 */
export function createWebPlatformAdapter(target: AppTarget): PlatformAdapter {
  return {
    target,
    getAuthStorage() {
      try {
        return getWindow()?.localStorage;
      } catch {
        // 隐私模式或受限 WebView 可能拒绝 storage，Supabase 会退化为内存会话。
        return undefined;
      }
    },
    getCurrentOrigin() {
      return getWindow()?.location.origin ?? "";
    },
    createWebSocket(url) {
      if (typeof WebSocket === "undefined") throw new Error("当前平台不支持 WebSocket");
      return new WebSocket(url);
    },
    voice: {
      isSecureContext: () => getWindow()?.isSecureContext ?? false,
      isMicrophoneSupported: () => Boolean(getWindow()?.navigator.mediaDevices?.getUserMedia),
      async enumerateDevices() {
        return (await getWindow()?.navigator.mediaDevices?.enumerateDevices()) ?? [];
      },
      async queryMicrophonePermission() {
        const permissions = getWindow()?.navigator.permissions;
        if (!permissions) return undefined;
        const status = await permissions.query({ name: "microphone" as PermissionName });
        return status.state;
      },
      async requestMicrophone(constraints) {
        const mediaDevices = getWindow()?.navigator.mediaDevices;
        if (!mediaDevices?.getUserMedia) throw new Error("当前平台不支持麦克风采集");
        return mediaDevices.getUserMedia({ audio: constraints });
      },
      createAudioContext() {
        if (typeof AudioContext === "undefined") throw new Error("当前平台不支持 Web Audio");
        return new AudioContext();
      },
    },
    display: {
      isFullscreenSupported: () => Boolean(getDocument()?.documentElement.requestFullscreen),
      isFullscreenActive: () => Boolean(getDocument()?.fullscreenElement),
      async requestFullscreen() {
        const element = getDocument()?.documentElement;
        if (!element?.requestFullscreen) throw new Error("当前平台不支持全屏");
        await element.requestFullscreen();
      },
      async exitFullscreen() {
        const currentDocument = getDocument();
        if (currentDocument?.fullscreenElement) await currentDocument.exitFullscreen();
      },
      onFullscreenChange(listener) {
        const currentDocument = getDocument();
        if (!currentDocument) return () => undefined;
        currentDocument.addEventListener("fullscreenchange", listener);
        return () => currentDocument.removeEventListener("fullscreenchange", listener);
      },
      getVisibilityState: () => getDocument()?.visibilityState ?? "hidden",
      onVisibilityChange(listener) {
        const currentDocument = getDocument();
        if (!currentDocument) return () => undefined;
        currentDocument.addEventListener("visibilitychange", listener);
        return () => currentDocument.removeEventListener("visibilitychange", listener);
      },
      async requestWakeLock() {
        const wakeLock = (
          getWindow()?.navigator as
            | (Navigator & {
                /** 浏览器 Wake Lock 扩展。 */
                wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
              })
            | undefined
        )?.wakeLock;
        return wakeLock ? wakeLock.request("screen") : null;
      },
    },
  };
}

/** 当前 Web SSR 或 WebView 构建共用的平台单例。 */
/** 自动检测 Tauri 环境使用对应适配器，否则使用标准浏览器适配器。 */
export const platformAdapter = isTauri()
  ? createTauriPlatformAdapter()
  : createWebPlatformAdapter(runtimeConfig.target);
