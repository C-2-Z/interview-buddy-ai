/** 题目和评分 DB 访问（含 Schema 兼容）*/
 import type { UserSupabaseClient } from "../../shared/db/supabase.js";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type QuestionSessionContext = {
  /** Agent 会话判别版本；旧会话为 null。 */
  agent_version?: string | null;
  position: string;
  difficulty: string;
  job_description: string | null;
  model_provider: string | null;
  model_name: string | null;
  user_api_key: string | null;
  interview_mode: string | null;
  voice_mode?: boolean | null;
};

export type QuestionWithSession = {
  id: string;
  question: string;
  answer: string | null;
  session_id: string;
  order_index: number;
  interview_sessions: QuestionSessionContext;
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

/**
 * 归一化 question with session
 *
 * @param data -
 * @returns
 */
function normalizeQuestionWithSession(data: unknown): QuestionWithSession {
  const question = data as QuestionWithSession;
  question.interview_sessions = {
    ...question.interview_sessions,
    interview_mode:
      question.interview_sessions.interview_mode ??
      (question.interview_sessions.voice_mode === true ? "voice" : "text"),
    agent_version: question.interview_sessions.agent_version ?? null,
  };
  return question;
}

/**
 * 获取 question with session
 * @returns
 */
export async function getQuestionWithSession(
  supabase: UserSupabaseClient,
  questionId: string,
): Promise<QuestionWithSession | null> {
  const selectors = [
    "id, question, answer, session_id, order_index, interview_sessions(position, difficulty, job_description, model_provider, model_name, user_api_key, interview_mode, voice_mode, agent_version)",
    "id, question, answer, session_id, order_index, interview_sessions(position, difficulty, job_description, model_provider, model_name, user_api_key, interview_mode, voice_mode)",
    "id, question, answer, session_id, order_index, interview_sessions(position, difficulty, job_description, model_provider, model_name, user_api_key, interview_mode)",
    "id, question, answer, session_id, order_index, interview_sessions(position, difficulty, job_description, model_provider, model_name, user_api_key, voice_mode)",
    "id, question, answer, session_id, order_index, interview_sessions(position, difficulty, job_description, model_provider, model_name, user_api_key)",
  ];

  for (const selector of selectors) {
    const { data, error } = await supabase
      .from("interview_questions")
      .select(selector)
      .eq("id", questionId)
      .single();

    if (!error && data) return normalizeQuestionWithSession(data);
    if (error && !isMissingSchemaColumn(error.message)) return null;
  }

  return null;
}

/**
 * 保存 conversation answer
 * @returns
 */
export async function saveConversationAnswer(
  supabase: UserSupabaseClient,
  questionId: string,
  conversation: ConversationMessage[],
): Promise<void> {
  const { error } = await supabase
    .from("interview_questions")
    .update({ answer: JSON.stringify(conversation) })
    .eq("id", questionId);
  if (error) throw new Error(error.message);
}

/**
 * 保存 evaluation
 * @returns
 */
export async function saveEvaluation(params: {
  supabase: UserSupabaseClient;
  questionId: string;
  sessionId?: string;
  answer: string;
  score: number;
  feedback: string;
  dimensionScores?: Record<string, unknown>;
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    answer: params.answer,
    score: params.score,
    feedback: params.feedback,
  };
  if (params.dimensionScores) {
    updateData.dimension_scores = params.dimensionScores;
  }
  /**
   * 查询
   *
   * @param params.supabase as any -
   * @returns
   */
  let query: any = (params.supabase as any)
    .from("interview_questions")
    .update(updateData)
    .eq("id", params.questionId);

  if (params.sessionId) {
    query = query.eq("session_id", params.sessionId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);
}

/**
 * 计数 session questions
 * @returns
 */
export async function countSessionQuestions(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("interview_questions")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * 更新 last activity
 * @returns
 */
export async function updateLastActivity(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("interview_sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
