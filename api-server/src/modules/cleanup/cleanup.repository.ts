import { getRequiredEnv } from "../../config/env.js";

function apiUrl(path: string): string {
  const base = getRequiredEnv("SUPABASE_URL");
  return `${base}/rest/v1${path}`;
}

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

export async function findStaleIdleSessions(idleMinutes: number): Promise<SessionRow[]> {
  const cutoff = new Date(Date.now() - idleMinutes * 60 * 1000).toISOString();
  const res = await fetch(
    `${apiUrl("/interview_sessions")}?status=eq.in_progress&or=(last_activity_at.lt.${cutoff},and(last_activity_at.is.null,created_at.lt.${cutoff}))&select=id`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`findStaleIdleSessions failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<SessionRow[]>;
}

export async function findExpiredSessions(hours: number): Promise<SessionRow[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${apiUrl("/interview_sessions")}?status=eq.in_progress&created_at=lt.${cutoff}&select=id`,
    { headers: adminHeaders() },
  );
  if (!res.ok) throw new Error(`findExpiredSessions failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<SessionRow[]>;
}

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
