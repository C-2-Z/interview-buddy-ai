import { callAI } from "../../shared/ai/ai-client.js";
import { parseJsonFromAI } from "../../shared/ai/json-parser.js";
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { ModelProvider } from "../model-providers/provider.types.js";
import {
  buildSkillQuestionPrompt,
} from "../skills/skills.service.js";
import type { SkillDef } from "../skills/skill.types.js";
import type {
  CreateSessionInput,
  GeneratedGenericQuestion,
  GeneratedSkillQuestion,
} from "./session.types.js";

export const QUESTION_GEN_SYSTEM_PROMPT =
  "你是专业的面试官助手，回答必须是有效的 JSON。";

export const FINISH_SYSTEM_PROMPT =
  "你是资深面试官，用中文给出简洁总结。";

export function buildGenericQuestionGenerationPrompt(
  input: CreateSessionInput,
): string {
  const companyHint = input.targetCompany
    ? `\n目标公司: ${input.targetCompany}\n请根据该公司的面试风格和侧重点来出题。`
    : "";

  const resumeHint = input.resumeContext
    ? `\n## 候选人简历背景\n${input.resumeContext}\n## 出题要求\n- 针对候选人实际项目经历出技术深度题\n- 覆盖候选人熟悉的技术栈\n`
    : "";

  return `你是一位资深的技术面试官。请为以下岗位的招聘生成 ${input.questionCount} 道面试题。

岗位: ${input.position}
难度: ${input.difficulty}
岗位需求描述: ${input.jobDescription || "未提供"}${companyHint}${resumeHint}

要求:
- 题目要贴合岗位和难度
- 紧扣岗位职责和技术要求，确保能筛选出符合该岗位要求的候选人
- 涵盖技术、行为、场景等不同类型
- 每道题独立、清晰、具体

请严格以 JSON 数组格式返回，只包含题目文本，例如:
["题目1", "题目2", "题目3"]`;
}

export async function generateGenericQuestions(
  input: CreateSessionInput,
  provider: ModelProvider,
): Promise<GeneratedGenericQuestion[]> {
  const text = await callAI(
    [
      { role: "system", content: QUESTION_GEN_SYSTEM_PROMPT },
      { role: "user", content: buildGenericQuestionGenerationPrompt(input) },
    ],
    provider,
  );
  const questions = parseJsonFromAI<string[]>(text);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("生成的题目格式错误");
  }
  return questions;
}

export async function generateSkillQuestions(params: {
  supabase: UserSupabaseClient;
  input: CreateSessionInput;
  skill: SkillDef;
  provider: ModelProvider;
}): Promise<GeneratedSkillQuestion[]> {
  const prompt = await buildSkillQuestionPrompt({
    supabase: params.supabase,
    skill: params.skill,
    difficulty: params.input.difficulty,
    jobDescription: params.input.jobDescription,
    questionCount: params.input.questionCount,
    targetCompany: params.input.targetCompany,
    resumeText: params.input.resumeText,
  });

  const text = await callAI(
    [
      { role: "system", content: QUESTION_GEN_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    params.provider,
  );
  const questions = parseJsonFromAI<GeneratedSkillQuestion[]>(text);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("生成的题目格式错误");
  }
  return questions;
}

