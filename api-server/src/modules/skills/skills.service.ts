import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import {
  buildDedupInstruction,
  buildReferenceSection,
  calculateAllocation,
  renderAllocationTable,
} from "./allocation.service.js";
import { getAllSkillMetas, getSkill } from "./skill-loader.js";
import { queryHistoricalTopics } from "./skills.repository.js";
import type { SkillDef } from "./skill.types.js";

export function listSkillMetas() {
  return getAllSkillMetas();
}

export function findSkill(skillId: string | undefined): SkillDef | undefined {
  return skillId ? getSkill(skillId) : undefined;
}

export async function buildSkillQuestionPrompt(params: {
  supabase: UserSupabaseClient;
  skill: SkillDef;
  difficulty: string;
  jobDescription: string;
  questionCount: number;
  targetCompany?: string;
  resumeText?: string;
}): Promise<string> {
  const allocation = calculateAllocation(
    params.skill.categories,
    params.questionCount,
  );
  const historicalTopics = await queryHistoricalTopics(
    params.supabase,
    params.skill.id,
  );
  const referenceSection = buildReferenceSection(params.skill, allocation);
  const allocationTable = renderAllocationTable(params.skill.categories, allocation);
  const dedupInstruction = buildDedupInstruction(historicalTopics);
  const companyHint = params.targetCompany
    ? `\n目标公司: ${params.targetCompany}`
    : "";
  const resumeHint = params.resumeText
    ? `\n候选人简历:\n${params.resumeText}`
    : "";
  const categoryKeys = params.skill.categories
    .map((category) => category.key)
    .join("、");

  return `${params.skill.persona}

职位: ${params.skill.name}
面试难度: ${params.difficulty}
岗位需求描述: ${params.jobDescription || "未提供"}${companyHint}${resumeHint}

${allocationTable}

${referenceSection ? `以下是各分类的参考知识点，出题时可以参考：\n\n${referenceSection}\n` : ""}${dedupInstruction}

请严格以如下 JSON 数组格式返回，每条题目必须标注所属分类：
[
  {"question": "题目文本", "category": "JAVA"},
  {"question": "题目文本", "category": "SPRING"}
]

注意：category 的值必须从以下分类标识中选择：${categoryKeys}`;
}

