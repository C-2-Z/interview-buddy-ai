/** immersive-voice-interview：可测试的沉浸语音状态转换规则。 */
import type { ImmersiveVoiceState } from "../types";

/** 会改变沉浸会话状态的稳定信号。 */
export type VoiceExperienceSignal =
  | "connect"
  | "connected"
  | "interviewer_audio"
  | "listen"
  | "transcript_final"
  | "pause"
  | "resume"
  | "connection_lost"
  | "failed"
  | "complete";

/**
 * 根据业务信号计算下一状态，完成态不可被迟到的连接事件覆盖。
 *
 * @param current - 当前沉浸语音状态。
 * @param signal - 浏览器或语音协议产生的稳定信号。
 * @returns 下一状态。
 */
export function reduceVoiceExperienceState(
  current: ImmersiveVoiceState,
  signal: VoiceExperienceSignal,
): ImmersiveVoiceState {
  if (current === "completed") return "completed";
  if (signal === "complete") return "completed";
  if (current === "recovery_required" && signal !== "connect" && signal !== "pause")
    return "recovery_required";
  if (signal === "failed") return "recovery_required";
  if (signal === "connection_lost") return "reconnecting";
  if (signal === "connect") return "connecting";
  if (signal === "connected") return "ready";
  if (signal === "interviewer_audio") return "interviewer_speaking";
  if (signal === "listen") return "listening";
  if (signal === "transcript_final") return "processing";
  if (signal === "pause") return "paused";
  if (signal === "resume") return "ready";
  return current;
}
