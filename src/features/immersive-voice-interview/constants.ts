/** immersive-voice-interview：候场默认值与状态展示文案。 */
import type { ImmersiveVoiceState, VoiceLobbyDraft } from "./types";

/** 语音候场的最小默认配置。 */
export const INITIAL_VOICE_LOBBY_DRAFT: VoiceLobbyDraft = {
  mode: "single",
  experienceMode: "",
  position: "",
  difficulty: "中级",
  questionCount: 5,
  targetCompany: "",
  modelProvider: "deepseek",
  brainId: "",
  useTrainingMemory: false,
};

/** 状态视觉体与 aria-live 共用的短文案。 */
export const VOICE_STATE_LABELS: Record<ImmersiveVoiceState, string> = {
  idle: "等待开始",
  checking: "正在检查设备",
  requesting_permission: "正在请求麦克风权限",
  connecting: "正在连接面试官",
  ready: "面试即将开始",
  interviewer_speaking: "面试官正在说话",
  listening: "正在聆听你的回答",
  processing: "正在理解你的回答",
  paused: "面试已暂停",
  reconnecting: "正在恢复连接",
  recovery_required: "需要你的操作",
  completed: "面试已完成",
};
