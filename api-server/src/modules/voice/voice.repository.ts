/** 语音面试 DB 访问 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";

export type VoiceSessionQuestion = {
  id: string;
  question: string;
  order_index: number;
  score: number | null;
};

export type VoiceSessionSnapshot = {
  session: Record<string, unknown>;
  questions: VoiceSessionQuestion[];
};

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

/**
 * 判断 voice session row
 *
 * @param row - 
 * @param unknown> - 
 * @returns 
 */
function isVoiceSessionRow(row: Record<string, unknown>): boolean {
  return row.interview_mode === "voice" || row.voice_mode === true;
}

/**
 * 标记 session voice mode
 * @returns 
 */
export async function markSessionVoiceMode(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .update({ voice_mode: true, interview_mode: "voice" })
    .eq("id", sessionId);
  if (!error) return;

  if (!isMissingSchemaColumn(error.message)) {
    throw new Error(error.message);
  }

  const { error: voiceModeError } = await supabase
    .from("interview_sessions")
    .update({ voice_mode: true })
    .eq("id", sessionId);
  if (!voiceModeError) return;
  if (!isMissingSchemaColumn(voiceModeError.message)) {
    throw new Error(voiceModeError.message);
  }

  const { error: interviewModeError } = await supabase
    .from("interview_sessions")
    .update({ interview_mode: "voice" })
    .eq("id", sessionId);
  if (!interviewModeError) return;
  if (!isMissingSchemaColumn(interviewModeError.message)) {
    throw new Error(interviewModeError.message);
  }

  throw new Error(
    "Voice interview mode columns are missing. Apply the voice interview migration before creating voice sessions.",
  );
}

/**
 * assert session access
 * @returns 
 */
export async function assertSessionAccess(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .select("id")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error("Session not found");
}

/**
 * assert voice session access
 * @returns 
 */
export async function assertVoiceSessionAccess(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const data = await getSessionModeRow(supabase, sessionId);
  if (!isVoiceSessionRow(data)) {
    throw new Error("This session is not a voice interview");
  }
}

/**
 * 获取 session mode row
 * @returns 
 */
async function getSessionModeRow(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const selectors = [
    "id, interview_mode, voice_mode",
    "id, interview_mode",
    "id, voice_mode",
  ];

  for (const selector of selectors) {
    const { data, error } = await supabase
      .from("interview_sessions")
      .select(selector)
      .eq("id", sessionId)
      .single();

    if (!error && data) {
      return withFallbackInterviewMode(data as unknown as Record<string, unknown>);
    }
    if (error && !isMissingSchemaColumn(error.message)) {
      throw new Error("Voice session not found");
    }
  }

  throw new Error(
    "Voice interview mode columns are missing. Apply the voice interview migration before connecting voice sessions.",
  );
}

/**
 * 获取 voice session with questions
 * @returns 
 */
export async function getVoiceSessionWithQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<VoiceSessionSnapshot> {
  await assertVoiceSessionAccess(supabase, sessionId);

  const { data: session, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(error.message);

  const questions = await listSessionQuestions(supabase, sessionId);
  return {
    session: withFallbackInterviewMode(session as Record<string, unknown>),
    questions,
  };
}

/**
 * 列出 session questions
 * @returns 
 */
export async function listSessionQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<VoiceSessionQuestion[]> {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("id, question, order_index, score")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * 获取 下一步 unscored question id
 * @returns 
 */
export async function getNextUnscoredQuestionId(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const questions = await listSessionQuestions(supabase, sessionId);
  return questions.find((question) => question.score == null)?.id ?? null;
}

/**
 * 获取 下一步 unscored question
 * @returns 
 */
export async function getNextUnscoredQuestion(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<VoiceSessionQuestion | null> {
  const questions = await listSessionQuestions(supabase, sessionId);
  return questions.find((question) => question.score == null) ?? null;
}
