/** 语音面试业务：创建/获取/结束 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  createInterviewSession,
  finishSession,
} from "../sessions/sessions.service.js";
import type { CreateSessionInput } from "../sessions/session.types.js";
import {
  assertVoiceSessionAccess,
  getVoiceSessionWithQuestions,
} from "./voice.repository.js";

/**
 * 创建 voice interview session
 * @returns
 */
export function createVoiceInterviewSession(params: {
  supabase: UserSupabaseClient;
  userId: string;
  input: Omit<CreateSessionInput, "interviewMode">;
}): Promise<{ sessionId: string }> {
  return createInterviewSession({
    supabase: params.supabase,
    userId: params.userId,
    input: { ...params.input, interviewMode: "voice" },
  });
}

/**
 * 获取 voice session
 * @returns
 */
export async function getVoiceSession(params: {
  supabase: UserSupabaseClient;
  sessionId: string;
}) {
  return getVoiceSessionWithQuestions(params.supabase, params.sessionId);
}

/**
 * 结束 voice session
 * @returns
 */
export async function finishVoiceSession(params: {
  supabase: UserSupabaseClient;
  userId: string;
  sessionId: string;
}) {
  await assertVoiceSessionAccess(params.supabase, params.sessionId);
  return finishSession(params);
}
