import type { QuestionItem, SessionDetail, SessionItem } from "@/features/interview-session/types";

export type InterviewHistoryItem = SessionItem;
export type InterviewReport = { session: SessionDetail; questions: QuestionItem[] };

export type InterviewHistoryFilters = {
  query: string;
  mode: "all" | "text" | "voice";
  status: "all" | "active" | "completed";
  difficulty: "all" | "初级" | "中级" | "高级";
};

export function isVoiceSession(session: Pick<SessionItem, "interview_mode" | "voice_mode">) {
  return session.interview_mode === "voice" || session.voice_mode === true;
}
