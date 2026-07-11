/* eslint-disable @typescript-eslint/no-explicit-any -- migration tables/functions are available before regenerated Supabase types */
import type { Json } from "../../lib/supabase-types.js";
import type { ServiceSupabaseClient, UserSupabaseClient } from "../../shared/db/supabase.js";
import type { GenerationSnapshot, QueuedSessionInput } from "./generation.types.js";

type AnyClient = UserSupabaseClient | ServiceSupabaseClient;

export async function createQueuedSession(params: {
  supabase: UserSupabaseClient;
  input: QueuedSessionInput;
  position: string;
  skillId: string | null;
  providerName: string;
  modelName: string;
  encryptedApiKey: string | null;
}): Promise<string> {
  const payload: Record<string, Json | undefined> = {
    skill_id: params.skillId,
    position: params.position,
    difficulty: params.input.difficulty,
    interview_mode: params.input.interviewMode,
    job_description: params.input.jobDescription || null,
    model_provider: params.providerName,
    model_name: params.modelName,
    user_api_key: params.encryptedApiKey,
    target_company: params.input.targetCompany || null,
    resume_text: params.input.resumeText || null,
    question_type_config: params.input.questionTypeConfig ?? null,
    resume_id: params.input.resumeId ?? null,
    requested_count: params.input.questionCount,
  };
  const { data, error } = await (params.supabase as any).rpc(
    "create_progressive_interview_session",
    { p_session: payload },
  );
  if (error || !data) throw new Error(error?.message ?? "Unable to create queued session");
  return String(data);
}

export async function getGenerationSnapshot(
  supabase: AnyClient,
  sessionId: string,
): Promise<GenerationSnapshot> {
  const { data, error } = await (supabase as any)
    .from("interview_sessions")
    .select("id, generation_status, generated_count, requested_count, generation_error")
    .eq("id", sessionId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Session not found");
  return {
    sessionId: data.id,
    status: data.generation_status,
    generatedCount: data.generated_count ?? 0,
    requestedCount: data.requested_count ?? 0,
    error: data.generation_error ?? null,
    version: Date.now(),
  };
}

export async function loadGenerationSession(
  supabase: ServiceSupabaseClient,
  sessionId: string,
): Promise<Record<string, any>> {
  const { data, error } = await (supabase as any)
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Session not found");
  return data;
}

export async function updateGenerationState(
  supabase: AnyClient,
  sessionId: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("interview_sessions")
    .update(update)
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function insertGeneratedQuestion(params: {
  supabase: ServiceSupabaseClient;
  sessionId: string;
  orderIndex: number;
  question: string;
  skillId: string | null;
  category: string | null;
}): Promise<boolean> {
  const { error } = await (params.supabase as any)
    .from("interview_questions")
    .insert({
      session_id: params.sessionId,
      order_index: params.orderIndex,
      question: params.question,
      skill_id: params.skillId,
      topic_summary: params.category,
    });
  if (!error) return true;
  if (/duplicate key|unique constraint/i.test(error.message)) return false;
  throw new Error(error.message);
}

export async function listExistingQuestions(
  supabase: ServiceSupabaseClient,
  sessionId: string,
): Promise<Array<{ order_index: number; question: string }>> {
  const { data, error } = await (supabase as any)
    .from("interview_questions")
    .select("order_index, question")
    .eq("session_id", sessionId)
    .order("order_index");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPendingOutboxJobs(
  supabase: ServiceSupabaseClient,
): Promise<Array<{ id: string; session_id: string }>> {
  const { data, error } = await (supabase as any)
    .from("background_jobs")
    .select("id, session_id")
    .eq("job_type", "question_generation")
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString())
    .order("created_at")
    .limit(25);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markOutboxJob(
  supabase: ServiceSupabaseClient,
  id: string,
  status: "dispatched" | "completed" | "failed",
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status, last_error: error ?? null };
  if (status === "dispatched") update.dispatched_at = new Date().toISOString();
  if (status === "completed") update.completed_at = new Date().toISOString();
  const { error: updateError } = await (supabase as any)
    .from("background_jobs")
    .update(update)
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
}

export async function completeOutboxForSession(
  supabase: ServiceSupabaseClient,
  sessionId: string,
  status: "completed" | "failed",
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    last_error: error ?? null,
    completed_at: status === "completed" ? new Date().toISOString() : null,
  };
  await (supabase as any)
    .from("background_jobs")
    .update(update)
    .eq("session_id", sessionId)
    .eq("job_type", "question_generation");
}

export async function resetGenerationForRetry(
  supabase: UserSupabaseClient,
  sessionId: string,
): Promise<void> {
  await updateGenerationState(supabase, sessionId, {
    generation_status: "queued",
    generation_error: null,
  });
  await (supabase as any)
    .from("background_jobs")
    .upsert(
      { session_id: sessionId, job_type: "question_generation", status: "pending", available_at: new Date().toISOString() },
      { onConflict: "session_id,job_type" },
    );
}
