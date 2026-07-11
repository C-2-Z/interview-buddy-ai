/** 面试中心：概览仪表盘 - 类型定义 */
import type { SessionItem } from "@/features/interview-session/types";

export type RecentInterview = SessionItem;

/**
 * 判断 voice interview
 *
 * @param session - 
 * @returns 
 */
export function isVoiceInterview(session: RecentInterview): boolean {
  return session.interview_mode === "voice" || session.voice_mode === true;
}
