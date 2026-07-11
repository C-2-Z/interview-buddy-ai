/* eslint-disable @typescript-eslint/no-explicit-any -- worker reads migration fields through the service-role client */
import { encrypt, decrypt } from "../settings/encryption.service.js";
import { resolveProviderForCreation } from "../model-providers/model-provider.service.js";
import { PROVIDER_CONFIGS } from "../../shared/ai/providers.js";
import { callAI } from "../../shared/ai/ai-client.js";
import { createServiceClient, type UserSupabaseClient } from "../../shared/db/supabase.js";
import { findSkill, buildSkillQuestionPrompt } from "../skills/skills.service.js";
import {
  buildGenericQuestionGenerationPrompt,
  streamGeneratedQuestions,
} from "../sessions/question-generation.service.js";
import type { CreateSessionInput } from "../sessions/session.types.js";
import type { ModelProvider, ProviderName } from "../model-providers/provider.types.js";
import {
  createQueuedSession,
  getGenerationSnapshot,
  insertGeneratedQuestion,
  listExistingQuestions,
  listPendingOutboxJobs,
  loadGenerationSession,
  markOutboxJob,
  resetGenerationForRetry,
  updateGenerationState,
} from "./generation.repository.js";
import {
  enqueueGeneration,
  progressiveGenerationEnabled,
  publishGenerationEvent,
  enqueueReport,
} from "./generation.queue.js";

export { progressiveGenerationEnabled };

function providerName(value: unknown): ProviderName {
  return value === "openai" || value === "anthropic" ? value : "deepseek";
}

export async function createProgressiveSession(params: {
  supabase: UserSupabaseClient;
  userId: string;
  input: CreateSessionInput & { interviewMode: "text" | "voice" };
}) {
  const provider = await resolveProviderForCreation(params.supabase, params.userId, params.input);
  const skill = findSkill(params.input.skillId);
  const encryptedApiKey = provider.apiKey ? `enc:${encrypt(provider.apiKey)}` : null;
  const sessionId = await createQueuedSession({
    supabase: params.supabase,
    input: params.input,
    position: skill?.name ?? params.input.position,
    skillId: skill?.id ?? null,
    providerName: provider.name,
    modelName: provider.model,
    encryptedApiKey,
  });
  void enqueueGeneration(sessionId).catch(() => undefined);
  return {
    sessionId,
    generationStatus: "queued" as const,
    generatedCount: 0,
    requestedCount: params.input.questionCount,
  };
}

async function providerForWorker(session: Record<string, any>): Promise<ModelProvider> {
  const name = providerName(session.model_provider);
  let apiKey: string | undefined;
  if (typeof session.user_api_key === "string" && session.user_api_key) {
    try {
      apiKey = session.user_api_key.startsWith("enc:")
        ? decrypt(session.user_api_key.slice(4))
        : session.user_api_key;
    } catch {
      apiKey = undefined;
    }
  }
  if (!apiKey) {
    const admin = createServiceClient();
    const { data } = await admin.auth.admin.getUserById(session.user_id);
    const settings = data.user?.user_metadata?.interview_settings as Record<string, string> | undefined;
    const encrypted = settings?.[`${name}_api_key`];
    if (encrypted) {
      try { apiKey = decrypt(encrypted); } catch { apiKey = undefined; }
    }
  }
  return {
    name,
    model:
      name === "deepseek" && (session.model_name === "deepseek-chat" || session.model_name === "deepseek-reasoner")
        ? "deepseek-v4-flash"
        : session.model_name || PROVIDER_CONFIGS[name].defaultModel,
    apiKey,
  };
}

function sessionInput(session: Record<string, any>, count: number): CreateSessionInput {
  return {
    skillId: session.skill_id ?? undefined,
    position: session.position,
    difficulty: session.difficulty,
    jobDescription: session.job_description ?? "",
    questionCount: count,
    targetCompany: session.target_company ?? "",
    questionTypeConfig: session.question_type_config ?? undefined,
    resumeText: session.resume_text ?? undefined,
    interviewMode: session.interview_mode,
  };
}

async function promptForSession(
  session: Record<string, any>,
  missing: number,
  exclusions: string[],
): Promise<string> {
  const input = sessionInput(session, missing);
  const skill = findSkill(session.skill_id ?? undefined);
  let prompt = skill
    ? await buildSkillQuestionPrompt({
        supabase: createServiceClient() as any,
        skill,
        difficulty: input.difficulty,
        jobDescription: input.jobDescription,
        questionCount: missing,
        targetCompany: input.targetCompany,
        resumeText: input.resumeText,
        userId: session.user_id,
      })
    : buildGenericQuestionGenerationPrompt(input);
  if (exclusions.length > 0) {
    prompt += `\n\n不要重复以下已经生成的题目：\n${exclusions.map((item) => `- ${item}`).join("\n")}`;
  }
  return prompt;
}

export async function processGenerationJob(sessionId: string): Promise<void> {
  const admin = createServiceClient();
  const session = await loadGenerationSession(admin, sessionId);
  const requested = Math.max(1, session.requested_count || 5);
  await updateGenerationState(admin, sessionId, {
    generation_status: "generating",
    generation_error: null,
    generation_started_at: new Date().toISOString(),
  });
  let existing = await listExistingQuestions(admin, sessionId);
  let generated = existing.length;
  const seen = new Set(existing.map((item) => item.question.trim().toLowerCase()));
  try {
    const provider = await providerForWorker(session);
    for (let attempt = 0; attempt < 3 && generated < requested; attempt += 1) {
      const prompt = await promptForSession(session, requested - generated, [...seen]);
      for await (const item of streamGeneratedQuestions({ prompt, provider, traceId: sessionId })) {
        if (generated >= requested) break;
        const key = item.question.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        const inserted = await insertGeneratedQuestion({
          supabase: admin,
          sessionId,
          orderIndex: generated,
          question: item.question,
          skillId: session.skill_id ?? null,
          category: item.category,
        });
        if (!inserted) continue;
        seen.add(key);
        generated += 1;
        await updateGenerationState(admin, sessionId, { generated_count: generated });
        const snapshot = await getGenerationSnapshot(admin, sessionId);
        await publishGenerationEvent({ type: "question_ready", ...snapshot, orderIndex: generated - 1 });
      }
      existing = await listExistingQuestions(admin, sessionId);
      generated = existing.length;
    }
    if (generated < requested) throw new Error(`Only generated ${generated} of ${requested} questions`);
    await updateGenerationState(admin, sessionId, {
      generation_status: "ready",
      generated_count: generated,
      generation_completed_at: new Date().toISOString(),
    });
    await publishGenerationEvent({ type: "ready", ...(await getGenerationSnapshot(admin, sessionId)) });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    await updateGenerationState(admin, sessionId, {
      generation_status: "failed",
      generation_error: message,
      generated_count: generated,
    });
    await publishGenerationEvent({ type: "failed", ...(await getGenerationSnapshot(admin, sessionId)) }).catch(() => undefined);
    throw error;
  }
}

export async function processReportJob(sessionId: string): Promise<void> {
  const admin = createServiceClient();
  const session = await loadGenerationSession(admin, sessionId);
  await updateGenerationState(admin, sessionId, { report_status: "generating" });
  const { data: questions, error } = await (admin as any)
    .from("interview_questions")
    .select("question, score, feedback")
    .eq("session_id", sessionId)
    .not("score", "is", null)
    .order("order_index");
  if (error) throw new Error(error.message);
  try {
    const provider = await providerForWorker(session);
    const feedback = questions?.length
      ? await callAI(
          [
            { role: "system", content: "你是资深面试官，用中文给出简洁、可执行的综合总结。" },
            { role: "user", content: `请根据以下逐题结果总结整体表现、亮点和改进方向（200-300字）：\n${questions.map((item: any, index: number) => `Q${index + 1}（${item.score}分）：${item.feedback ?? ""}`).join("\n")}` },
          ],
          provider,
          { taskProfile: "report", maxTokens: 1000, thinkingMode: "enabled", traceId: sessionId },
        )
      : "暂无已评分题目。";
    await updateGenerationState(admin, sessionId, {
      overall_feedback: feedback,
      report_status: "ready",
    });
    await publishGenerationEvent({ type: "report_ready", ...(await getGenerationSnapshot(admin, sessionId)) });
  } catch (reportError) {
    await updateGenerationState(admin, sessionId, { report_status: "failed" });
    throw reportError;
  }
}

export async function queueReport(sessionId: string): Promise<void> {
  await enqueueReport(sessionId);
}

export async function dispatchPendingGenerationJobs(): Promise<void> {
  if (!progressiveGenerationEnabled()) return;
  const admin = createServiceClient();
  for (const outbox of await listPendingOutboxJobs(admin)) {
    try {
      await enqueueGeneration(outbox.session_id);
      await markOutboxJob(admin, outbox.id, "dispatched");
    } catch {
      return;
    }
  }
}

export function generationSnapshot(supabase: UserSupabaseClient, sessionId: string) {
  return getGenerationSnapshot(supabase, sessionId);
}

export async function retryGeneration(supabase: UserSupabaseClient, sessionId: string) {
  await resetGenerationForRetry(supabase, sessionId);
  await enqueueGeneration(sessionId);
  return getGenerationSnapshot(supabase, sessionId);
}
