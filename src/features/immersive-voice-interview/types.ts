/** immersive-voice-interview：候场预检与沉浸会话的前端状态契约。 */

/** 沉浸语音前端统一状态。 */
export type ImmersiveVoiceState =
  | "idle"
  | "checking"
  | "requesting_permission"
  | "connecting"
  | "ready"
  | "interviewer_speaking"
  | "listening"
  | "processing"
  | "paused"
  | "reconnecting"
  | "recovery_required"
  | "completed";

/** 浏览器麦克风权限状态。 */
export type MicrophonePermissionState = "unknown" | "prompt" | "granted" | "denied";

/** 浏览器设备预检结果。 */
export type VoiceDevicePreflight = Readonly<{
  /** 当前页面是否为安全上下文。 */ secureContext: boolean;
  /** 浏览器是否提供媒体设备 API。 */ mediaDevicesSupported: boolean;
  /** 是否至少检测到一个音频输入。 */ microphoneDetected: boolean | null;
  /** 当前麦克风权限。 */ permission: MicrophonePermissionState;
  /** 用户可见的安全错误信息。 */ error: string | null;
}>;

/** 语音候场页的精简创建草稿。 */
export type VoiceLobbyDraft = Readonly<{
  /** 单面试官或多角色面试。 */ mode: "single" | "panel";
  /** 目标岗位。 */ position: string;
  /** 难度。 */ difficulty: "初级" | "中级" | "高级";
  /** 题目数量。 */ questionCount: number;
  /** 可选目标公司。 */ targetCompany: string;
  /** 模型供应商。 */ modelProvider: "deepseek" | "openai" | "anthropic";
  /** 用户主动绑定的单个 Brain。 */ brainId: string;
  /** 本场是否使用已授权的长期训练摘要。 */ useTrainingMemory: boolean;
}>;

/** 沉浸房间显示的单条字幕。 */
export type VoiceCaptionView = Readonly<{
  /** 字幕来源。 */ speaker: "interviewer" | "candidate" | "system";
  /** 已脱敏或用户本人转写文本。 */ text: string;
  /** 是否为尚未结束的实时转写。 */ partial: boolean;
}>;

/** 可向用户展示的语音恢复错误。 */
export type VoiceRecoveryIssue = Readonly<{
  /** 稳定错误码。 */ code: string;
  /** 发生阶段。 */ stage: string;
  /** 用户可理解的说明。 */ message: string;
  /** 是否适合原地重试。 */ retryable: boolean;
}>;
