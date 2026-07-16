/** Tauri WebView2 平台适配器：封装 Windows 桌面端的设备能力入口。 */
import type {
  PlatformAdapter,
  VoicePlatformAdapter,
  DisplayPlatformAdapter,
  WakeLockSentinelLike,
} from "./platform-adapter";
import type { AppTarget } from "@/shared/runtime/runtime-config";

/** Tauri 下 file:// 不是 secure context，但 getUserMedia 通过 capability 声明仍然可用。 */
const TAURI_TARGET: AppTarget = "native";

/** 安全读取 window 对象。 */
function getWin(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** 安全读取 document 对象。 */
function getDoc(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

/**
 * 创建 Tauri 平台适配器。
 * WebSocket、localStorage、getUserMedia 与 Web 版行为一致；
 * 差异点：isSecureContext 始终为 false，WakeLock 返回空锁，
 * 全屏和可见性依赖 WebView2 的 Web API（与 Web 版相同）。
 */
export function createTauriPlatformAdapter(): PlatformAdapter {
  return {
    target: TAURI_TARGET,

    /** Tauri WebView2 中 localStorage 工作正常。 */
    getAuthStorage() {
      try {
        return getWin()?.localStorage;
      } catch {
        return undefined;
      }
    },

    /** Tauri 开发时 origin 是 http://localhost:5173，生产是 tauri://localhost。 */
    getCurrentOrigin() {
      return getWin()?.location.origin ?? "tauri://localhost";
    },

    /** WebView2 原生支持 WebSocket。 */
    createWebSocket(url: string) {
      if (typeof WebSocket === "undefined") throw new Error("当前平台不支持 WebSocket");
      return new WebSocket(url);
    },

    voice: createTauriVoiceAdapter(),
    display: createTauriDisplayAdapter(),
  };
}

function createTauriVoiceAdapter(): VoicePlatformAdapter {
  return {
    /** Tauri 下 file:// 不是 secure context。 */
    isSecureContext: () => false,

    /** WebView2 通过 Tauri capability 声明后支持 getUserMedia。 */
    isMicrophoneSupported: () => {
      try {
        return Boolean(getWin()?.navigator.mediaDevices?.getUserMedia);
      } catch {
        return false;
      }
    },

    async enumerateDevices(): Promise<MediaDeviceInfo[]> {
      return (await getWin()?.navigator.mediaDevices?.enumerateDevices()) ?? [];
    },

    /** Tauri 下 Permissions API 可能因 file:// 不可用。 */
    async queryMicrophonePermission(): Promise<PermissionState | undefined> {
      const permissions = getWin()?.navigator.permissions;
      if (!permissions) return undefined;
      try {
        const status = await permissions.query({ name: "microphone" as PermissionName });
        return status.state;
      } catch {
        // Tauri WebView2 中 Permissions API 可能未暴露，返回 undefined。
        return undefined;
      }
    },

    async requestMicrophone(constraints: MediaTrackConstraints): Promise<MediaStream> {
      const mediaDevices = getWin()?.navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) throw new Error("当前平台不支持麦克风采集");
      try {
        return await mediaDevices.getUserMedia({ audio: constraints });
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "NotAllowedError") {
            throw new Error("麦克风权限被拒绝，请在 Windows 隐私设置中允许麦克风访问");
          }
          if (err.name === "NotFoundError") {
            throw new Error("未检测到麦克风设备");
          }
        }
        throw err;
      }
    },

    createAudioContext(): AudioContext {
      if (typeof AudioContext === "undefined") throw new Error("当前平台不支持 Web Audio");
      return new AudioContext();
    },
  };
}

function createTauriDisplayAdapter(): DisplayPlatformAdapter {
  return {
    /** WebView2 支持 Fullscreen API。 */
    isFullscreenSupported: () => Boolean(getDoc()?.documentElement.requestFullscreen),
    isFullscreenActive: () => Boolean(getDoc()?.fullscreenElement),

    async requestFullscreen(): Promise<void> {
      const element = getDoc()?.documentElement;
      if (!element?.requestFullscreen) throw new Error("当前平台不支持全屏");
      await element.requestFullscreen();
    },

    async exitFullscreen(): Promise<void> {
      const currentDoc = getDoc();
      if (currentDoc?.fullscreenElement) await currentDoc.exitFullscreen();
    },

    onFullscreenChange(listener: () => void): () => void {
      const currentDoc = getDoc();
      if (!currentDoc) return () => undefined;
      currentDoc.addEventListener("fullscreenchange", listener);
      return () => currentDoc.removeEventListener("fullscreenchange", listener);
    },

    getVisibilityState: () => getDoc()?.visibilityState ?? "hidden",

    onVisibilityChange(listener: () => void): () => void {
      const currentDoc = getDoc();
      if (!currentDoc) return () => undefined;
      currentDoc.addEventListener("visibilitychange", listener);
      return () => currentDoc.removeEventListener("visibilitychange", listener);
    },

    /** Tauri 2 不直接支持 Web WakeLock API，返回空 sentinel（始终已释放）。 */
    async requestWakeLock(): Promise<WakeLockSentinelLike | null> {
      return {
        released: true,
        async release() {
          /* 无操作 */
        },
        addEventListener() {
          /* 无操作 */
        },
      };
    },
  };
}
