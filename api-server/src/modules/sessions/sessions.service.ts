/** Interview session query service (read-only since Agent takeover) */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  listSessions as listSessionsRepo,
  getSessionWithQuestions,
} from "./sessions.repository.js";

/** List current user's sessions (Agent-only) */
export function listSessions(supabase: UserSupabaseClient) {
  return listSessionsRepo(supabase);
}

/** Get session details with questions (Agent-only) */
export function getSession(supabase: UserSupabaseClient, sessionId: string) {
  return getSessionWithQuestions(supabase, sessionId);
}
