/** 清理服务 DB 访问 */
import { getRequiredEnv } from "../../config/env.js";

/**
 * api url
 *
 * @param path - 
 * @returns 
 */
function apiUrl(path: string): string {
  const base = getRequiredEnv("SUPABASE_URL");
  return `${base}/rest/v1${path}`;
}

/**
 * admin headers
 * @returns 
 */
function adminHeaders(): Record<string, string> {
  return {
    apikey: getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    "Content-Type": "application/json",
    // No Authorization header — service_role key in apikey is sufficient
    Prefer: "return=minimal",
  };
}

export interface SessionRow {
  id: string;
}

/**
 * 查找 stale idle sessions
 *
 * @param idleMinutes - 
 * @returns Promise<
 */
export async function findStaleIdleSessions(idleMinutes: number): Promise<SessionRow[]> {
  const cutoff = new Date(Date.now() - idleMinutes * 60 * 1000).toISOString();
  const res = await fetch(
    `${apiUrl("/interview_sessions")}?status=eq.in_progress&or=(last_activity_at.lt.${cutoff},and(last_activity_at.is.null,created_at.lt.${cutoff}))&select=id`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`findStaleIdleSessions failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<SessionRow[]>;
}

/**
 * 查找 expired sessions
 *
 * @param hours - 
 * @returns Promise<
 */
export async function findExpiredSessions(hours: number): Promise<SessionRow[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${apiUrl("/interview_sessions")}?status=eq.in_progress&created_at=lt.${cutoff}&select=id`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`findExpiredSessions failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<SessionRow[]>;
}

/**
 * 关闭 session
 *
 * @param sessionId - 
 * @param feedback - 
 * @returns Promise<
 */
export async function closeSession(sessionId: string, feedback: string): Promise<void> {
  const res = await fetch(
    `${apiUrl("/interview_sessions")}?id=eq.${sessionId}`,
    {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify({
        status: "completed",
        overall_score: 0,
        overall_feedback: feedback,
      }),
    },
  );
  if (!res.ok) throw new Error(`closeSession failed: ${res.status} ${await res.text()}`);
}
