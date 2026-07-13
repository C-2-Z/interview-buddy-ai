/** 新旧面试场次与题目的只读兼容 Repository。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";

/**
 * 判断 missing schema column
 *
 * @param message -
 * @returns
 */
function isMissingSchemaColumn(message: string): boolean {
  return /schema cache|column .* does not exist|Could not find the '.*' column/i.test(
    message,
  );
}
function withFallbackInterviewMode<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    interview_mode:
      typeof row.interview_mode === "string"
        ? row.interview_mode
        : row.voice_mode === true
          ? "voice"
          : "text",
  };
}
/** 列出当前用户所有新旧会话；旧会话由前端标记只读。 */
export async function listSessions(supabase: UserSupabaseClient) {
  const selectors = [
    "id, position, difficulty, status, overall_score, created_at, interview_mode, voice_mode, agent_version",
    "id, position, difficulty, status, overall_score, created_at, interview_mode, agent_version",
    "id, position, difficulty, status, overall_score, created_at, voice_mode, agent_version",
    "id, position, difficulty, status, overall_score, created_at, agent_version",
  ];

  for (const selector of selectors) {
    const { data, error } = await supabase
      .from("interview_sessions")
      .select(selector)
      .order("created_at", { ascending: false });

    if (!error) {
      return (data ?? []).map((row) =>
        withFallbackInterviewMode(row as unknown as Record<string, unknown>),
      );
    }
    if (!isMissingSchemaColumn(error.message)) throw new Error(error.message);
  }

  throw new Error(
    "Unable to list sessions because interview mode columns are unavailable.",
  );
}
/** 读取一场新旧会话及题目，不提供任何写能力。 */
export async function getSessionWithQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
) {
  const [sessionResult, questionResult] = await Promise.all([
    supabase.from("interview_sessions").select("*").eq("id", sessionId).single(),
    supabase.from("interview_questions").select("*").eq("session_id", sessionId).order("order_index"),
  ]);
  const { data: session, error } = sessionResult;
  const { data: questions, error: qErr } = questionResult;
  if (error) throw new Error(error.message);
  if (qErr) throw new Error(qErr.message);

  return {
    session: withFallbackInterviewMode(
      session as unknown as Record<string, unknown>,
    ),
    questions: questions ?? [],
  };
}
