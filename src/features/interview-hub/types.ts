import type { SessionItem } from "@/features/interview-session/types";

export type RecentInterview = SessionItem;

export function isVoiceInterview(session: RecentInterview): boolean {
  return session.interview_mode === "voice" || session.voice_mode === true;
}
