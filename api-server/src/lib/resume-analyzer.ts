/** 简历 AI 分析：提取技能、经验结构化 */
﻿import { callAI } from "../shared/ai/ai-client.js";
import { parseJsonFromAI } from "../shared/ai/json-parser.js";
import { createModuleLogger } from "../modules/voice/voice-logger.js";

const logger = createModuleLogger("resume-analyzer");

/** AI 结构化分析结果 */
export interface ResumeAnalysis {
  skills: string[];
  workExperience: Array<{
    company: string;
    role: string;
    years: string;
  }>;
  projects: Array<{
    name: string;
    techStack: string[];
    description: string;
  }>;
  education: {
    school: string;
    major: string;
    degree: string;
  };
  overallAssessment: string;
  suggestedQuestions: string[];
}

const SYSTEM_PROMPT = `你是一位专业的技术简历分析专家。
请分析以下简历内容，输出结构化的分析结果。

请严格以 JSON 格式返回，格式如下：
{
  "skills": ["React", "TypeScript"],
  "workExperience": [
    { "company": "公司名", "role": "职位", "years": "3年" }
  ],
  "projects": [
    { "name": "项目名", "techStack": ["React", "Node.js"], "description": "项目描述" }
  ],
  "education": { "school": "学校", "major": "专业", "degree": "本科" },
  "overallAssessment": "综合评估（50字以内）",
  "suggestedQuestions": ["追问1", "追问2", "追问3"]
}`;

/**
 * 调用 DeepSeek 对简历进行结构化分析
 * 返回结构化 JSON，解析失败时返回 null
 */
export async function analyzeResume(parsedText: string): Promise<ResumeAnalysis | null> {
  try {
    const text = await callAI([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `请分析以下简历内容：\n\n${parsedText.slice(0, 3000)}`,
      },
    ]);

    return parseJsonFromAI<ResumeAnalysis>(text);
  } catch (err) {
    logger.error(err instanceof Error ? err : new Error(String(err)), {
      event: "resume_analysis_failed",
    });
    return null;
  }
}
