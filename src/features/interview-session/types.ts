import type { Database } from "@/integrations/supabase/types";

type SessionRow = Database["public"]["Tables"]["interview_sessions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["interview_questions"]["Row"];

export type SessionItem = Pick<
  SessionRow,
  "id" | "position" | "difficulty" | "status" | "overall_score" | "created_at"
>;
export type SessionDetail = SessionRow;
export type QuestionItem = QuestionRow;

export type Message = {
  id?: string;
  question_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

