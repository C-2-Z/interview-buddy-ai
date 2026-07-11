/** 过期面试场次自动关闭 */
import { findStaleIdleSessions, findExpiredSessions, closeSession } from "./cleanup.repository.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { getRequiredEnv } from "../../config/env.js";
import { createModuleLogger } from "../voice/voice-logger.js";

const IDLE_TIMEOUT_MINUTES = 10;
const EXPIRED_TIMEOUT_HOURS = 24;
const logger = createModuleLogger("cleanup");

/**
 * Lazy cleanup — runs within the user's request lifecycle.
 * Checks if the current user has any stale in_progress sessions and closes them.
 * This works locally (uses UserSupabaseClient, not admin REST) and in production.
 */
export async function closeStaleSessionsForUser(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    const { data: staleSessions, error } = await supabase
      .from("interview_sessions")
      .select("id")
      .eq("status", "in_progress")
      .eq("user_id", userId)
      .or(`last_activity_at.lt.${cutoff},and(last_activity_at.is.null,created_at.lt.${cutoff})`);

    if (error) throw error;
    if (!staleSessions || staleSessions.length === 0) return;

    for (const session of staleSessions) {
      const { error: updateError } = await supabase
        .from("interview_sessions")
        .update({
          status: "completed",
          overall_score: 0,
          overall_feedback: "面试因长时间无活动自动结束",
        })
        .eq("id", session.id);
      if (updateError) throw updateError;
      logger.info("stale_session_closed", { sessionId: session.id, userId });
    }
  } catch (err) {
    // Non-critical — don't disrupt the main request
    logger.error(err instanceof Error ? err : new Error(String(err)), {
      event: "lazy_cleanup_failed",
    });
  }
}

/**
 * 运行 cleanup
 * @returns Promise<
 */
export async function runCleanup(): Promise<void> {
  // Guard — check we have the env vars needed before querying
  try {
    getRequiredEnv("SUPABASE_URL");
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch {
    // Service role key not available locally — skipping background cleanup
    return;
  }

  try {
    // — idle sessions (last_activity_at > 10 min ago) —
    const idleSessions = await findStaleIdleSessions(IDLE_TIMEOUT_MINUTES);
    for (const session of idleSessions) {
      await closeSession(session.id, "面试因长时间无活动自动结束");
    }
    if (idleSessions.length > 0) {
      logger.info("idle_sessions_closed", { count: idleSessions.length });
    }

    // — expired sessions (created > 24h ago, still in_progress) —
    const expiredSessions = await findExpiredSessions(EXPIRED_TIMEOUT_HOURS);
    for (const session of expiredSessions) {
      const alreadyClosed = idleSessions.some((s) => s.id === session.id);
      if (!alreadyClosed) {
        await closeSession(session.id, "面试已超过24小时，自动关闭");
      }
    }
    if (expiredSessions.length > 0) {
      logger.info("expired_sessions_closed", { count: expiredSessions.length });
    }
  } catch (err) {
    const cause = (err as any)?.cause;
    if (cause?.code === "EACCES") {
      return;
    }
    if (err instanceof Error && err.message?.includes("fetch failed")) {
      return;
    }
    logger.error(err instanceof Error ? err : new Error(String(err)), {
      event: "cleanup_failed",
    });
  }
}
