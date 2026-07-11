/** 面试会话：对话面板、状态管理 - 类型定义 */
import type { Database } from "@/integrations/supabase/types";

type SessionRow = Database["public"]["Tables"]["interview_sessions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["interview_questions"]["Row"];

export type SessionItem = Pick<
  SessionRow,
  | "id"
  | "position"
  | "difficulty"
  | "status"
  | "overall_score"
  | "created_at"
  | "interview_mode"
  | "voice_mode"
>;
export type SessionDetail = SessionRow & {
  dimension_summary?: DimensionSummary | null;
};
export type QuestionItem = QuestionRow;

export type Message = {
  id?: string;
  question_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

