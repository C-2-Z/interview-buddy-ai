/** immersive-voice-interview：只检查浏览器设备与麦克风权限。 */
import { useCallback, useEffect, useState } from "react";
import type { MicrophonePermissionState, VoiceDevicePreflight } from "../types";
import { platformAdapter } from "@/shared/platform/platform-adapter";

const INITIAL_PREFLIGHT: VoiceDevicePreflight = {
  secureContext: true,
  mediaDevicesSupported: true,
  microphoneDetected: null,
  permission: "unknown",
  error: null,
};

/** 将浏览器权限状态收口到产品允许的固定联合。 */
function normalizePermission(value: PermissionState | undefined): MicrophonePermissionState {
  return value === "granted" || value === "denied" || value === "prompt" ? value : "unknown";
}

/** 管理语音候场的浏览器设备预检和用户手势授权。 */
export function useVoiceDevicePreflight() {
  const [preflight, setPreflight] = useState<VoiceDevicePreflight>(INITIAL_PREFLIGHT);
  const [checking, setChecking] = useState(true);

  /** 被动读取能力、设备和权限，不主动弹出授权对话框。 */
  const check = useCallback(async () => {
    const secureContext = platformAdapter.voice.isSecureContext();
    const mediaDevicesSupported = platformAdapter.voice.isMicrophoneSupported();
    let microphoneDetected: boolean | null = null;
    let permission: MicrophonePermissionState = "unknown";

    if (mediaDevicesSupported) {
      try {
        const devices = await platformAdapter.voice.enumerateDevices();
        microphoneDetected = devices.some((device) => device.kind === "audioinput");
      } catch {
        microphoneDetected = null;
      }
      try {
        permission = normalizePermission(await platformAdapter.voice.queryMicrophonePermission());
      } catch {
        permission = "unknown";
      }
    }

    setPreflight({
      secureContext,
      mediaDevicesSupported,
      microphoneDetected,
      permission,
      error: !secureContext
        ? "当前页面不是安全连接，浏览器不会开放麦克风。"
        : !mediaDevicesSupported
          ? "当前浏览器不支持麦克风采集。"
          : microphoneDetected === false
            ? "未检测到可用麦克风，请连接设备后重试。"
            : permission === "denied"
              ? "麦克风权限已被拒绝，请在浏览器地址栏设置中重新允许。"
              : null,
    });
    setChecking(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  /** 在明确用户手势中请求麦克风，并立即释放测试流。 */
  const requestMicrophone = useCallback(async (): Promise<boolean> => {
    if (
      !platformAdapter.voice.isSecureContext() ||
      !platformAdapter.voice.isMicrophoneSupported()
    ) {
      await check();
      return false;
    }
    setChecking(true);
    try {
      const stream = await platformAdapter.voice.requestMicrophone({
        echoCancellation: true,
        noiseSuppression: true,
      });
      for (const track of stream.getTracks()) track.stop();
      setPreflight((current) => ({
        ...current,
        microphoneDetected: true,
        permission: "granted",
        error: null,
      }));
      return true;
    } catch {
      setPreflight((current) => ({
        ...current,
        permission: "denied",
        error: "无法使用麦克风。请允许权限、确认设备未被其他应用占用，然后重试。",
      }));
      return false;
    } finally {
      setChecking(false);
    }
  }, [check]);

  return { preflight, checking, check, requestMicrophone };
}
