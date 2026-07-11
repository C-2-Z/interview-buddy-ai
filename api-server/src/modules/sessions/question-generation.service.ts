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

请严格以 JSON 数组格式返回，每项只包含 question 字段，例如:
[{"question":"题目1"},{"question":"题目2"},{"question":"题目3"}]`;
}

export type StreamedQuestion = { question: string; category: string | null };

export class IncrementalQuestionParser {
  private buffer = "";
  private cursor = 0;
  private objectStart = -1;
  private depth = 0;
  private inString = false;
  private escaped = false;

  push(chunk: string): StreamedQuestion[] {
    this.buffer += chunk;
    const results: StreamedQuestion[] = [];
    for (; this.cursor < this.buffer.length; this.cursor += 1) {
      const char = this.buffer[this.cursor];
      if (this.escaped) {
        this.escaped = false;
        continue;
      }
      if (this.inString && char === "\\") {
        this.escaped = true;
        continue;
      }
      if (char === '"') {
        this.inString = !this.inString;
        continue;
      }
      if (this.inString) continue;
      if (char === "{") {
        if (this.depth === 0) this.objectStart = this.cursor;
        this.depth += 1;
      } else if (char === "}" && this.depth > 0) {
        this.depth -= 1;
        if (this.depth === 0 && this.objectStart >= 0) {
          const raw = this.buffer.slice(this.objectStart, this.cursor + 1);
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const question = String(parsed.question ?? "").trim();
            if (question) {
              results.push({
                question,
                category:
                  typeof parsed.category === "string" ? parsed.category : null,
              });
            }
          } catch {
            // A malformed object is ignored; the worker can request missing items.
          }
          this.objectStart = -1;
        }
      }
    }
    if (this.objectStart < 0 && this.cursor > 8192) {
      this.buffer = this.buffer.slice(this.cursor);
      this.cursor = 0;
    }
    return results;
  }
}

export async function* streamGeneratedQuestions(params: {
  prompt: string;
  provider: ModelProvider;
  signal?: AbortSignal;
  traceId?: string;
}): AsyncIterable<StreamedQuestion> {
  const parser = new IncrementalQuestionParser();
  for await (const delta of (await import("../../shared/ai/ai-client.js")).streamAI(
    [
      { role: "system", content: QUESTION_GEN_SYSTEM_PROMPT },
      { role: "user", content: params.prompt },
    ],
    params.provider,
    params.signal,
    {
      taskProfile: "generation",
      maxTokens: 2048,
      thinkingMode: "disabled",
      traceId: params.traceId,
    },
  )) {
    for (const question of parser.push(delta)) yield question;
  }
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
  const questions = parseJsonFromAI<Array<string | { question: string }>>(text)
    .map((item) => typeof item === "string" ? item : item.question)
    .filter(Boolean);
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

