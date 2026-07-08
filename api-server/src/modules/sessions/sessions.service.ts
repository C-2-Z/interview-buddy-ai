import { callAI } from "../../shared/ai/ai-client.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  resolveProviderForCreation,
  resolveProviderForSession,
} from "../model-providers/model-provider.service.js";
import { findSkill } from "../skills/skills.service.js";
import {
  FINISH_SYSTEM_PROMPT,
  generateGenericQuestions,
  generateSkillQuestions,
} from "./question-generation.service.js";
import {
  completeSession,
  createQuestions,
  createSession,
  getScoredQuestions,
  getSessionProviderConfig,
  getSessionWithQuestions,
  listSessions as listSessionsRepo,
} from "./sessions.repository.js";
import type {
  CreateSessionInput,
  GeneratedGenericQuestion,
  GeneratedSkillQuestion,
} from "./session.types.js";

function questionConfig(input: CreateSessionInput) {
  return input.questionTypeConfig
    ? (input.questionTypeConfig as Record<string, number>)
    : null;
}

function baseSessionRow(params: {
  input: CreateSessionInput;
  userId: string;
  position: string;
  skillId: string | null;
  providerName: "deepseek" | "openai" | "anthropic";
  modelName: string;
}) {
  return {
    user_id: params.userId,
    skill_id: params.skillId,
    position: params.position,
    difficulty: params.input.difficulty,
    job_description: params.input.jobDescription || null,
    model_provider: params.providerName,
    model_name: params.modelName || null,
    user_api_key: params.input.userApiKey || null,
    target_company: params.input.targetCompany || null,
    resume_text: params.input.resumeText || null,
    question_type_config: questionConfig(params.input),
  };
}

function genericQuestionRows(
  sessionId: string,
  questions: GeneratedGenericQuestion[],
) {
  return questions.map((question, index) => ({
    session_id: sessionId,
    order_index: index,
    question,
    skill_id: null,
    topic_summary: null,
  }));
}

function skillQuestionRows(
  sessionId: string,
  skillId: string,
  questions: GeneratedSkillQuestion[],
) {
  return questions.map((question, index) => ({
    session_id: sessionId,
    order_index: index,
    question: question.question,
    skill_id: skillId,
    topic_summary: question.category || null,
  }));
}

export async function createInterviewSession(params: {
  supabase: UserSupabaseClient;
  userId: string;
  input: CreateSessionInput;
}): Promise<{ sessionId: string }> {
  const provider = await resolveProviderForCreation(
    params.supabase,
    params.userId,
    params.input,
  );
  const skill = findSkill(params.input.skillId);

  if (skill) {
    const questions = await generateSkillQuestions({
      supabase: params.supabase,
      input: params.input,
      skill,
      provider,
    });
    const session = await createSession(
      params.supabase,
      baseSessionRow({
        input: params.input,
        userId: params.userId,
        position: skill.name,
        skillId: skill.id,
        providerName: provider.name,
        modelName: provider.model,
      }),
    );
    await createQuestions(
      params.supabase,
      skillQuestionRows(session.id, skill.id, questions),
    );
    return { sessionId: session.id };
  }

  const questions = await generateGenericQuestions(params.input, provider);
  const session = await createSession(
    params.supabase,
    baseSessionRow({
      input: params.input,
      userId: params.userId,
      position: params.input.position,
      skillId: null,
      providerName: provider.name,
      modelName: provider.model,
    }),
  );
  await createQuestions(params.supabase, genericQuestionRows(session.id, questions));
  return { sessionId: session.id };
}

export function listSessions(supabase: UserSupabaseClient) {
  return listSessionsRepo(supabase);
}

export function getSession(supabase: UserSupabaseClient, sessionId: string) {
  return getSessionWithQuestions(supabase, sessionId);
}

export async function finishSession(params: {
  supabase: UserSupabaseClient;
  userId: string;
  sessionId: string;
}): Promise<{ overallScore: number; overallFeedback: string }> {
  const providerConfig = await getSessionProviderConfig(
    params.supabase,
    params.sessionId,
  );
  const provider = await resolveProviderForSession(
    params.supabase,
    params.userId,
    providerConfig,
  );
  const questions = await getScoredQuestions(params.supabase, params.sessionId);
  const scored = questions.filter((question) => question.score != null);
  const overallScore = scored.length
    ? Math.round(
        scored.reduce((sum, question) => sum + (question.score ?? 0), 0) /
          scored.length,
      )
    : 0;

  let overallFeedback = "";
  if (scored.length > 0) {
    overallFeedback = await callAI(
      [
        { role: "system", content: FINISH_SYSTEM_PROMPT },
        {
          role: "user",
          content: `以下是候选人各题得分与反馈，请总结整体表现、亮点与改进方向（200-300字）：\n${scored
            .map(
              (question, index) =>
                `Q${index + 1}(得分${question.score}): ${question.feedback}`,
            )
            .join("\n\n")}`,
        },
      ],
      provider,
    );
  }

  await completeSession(
    params.supabase,
    params.sessionId,
    overallScore,
    overallFeedback,
  );
  return { overallScore, overallFeedback };
}
