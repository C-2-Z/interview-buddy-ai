/** 面试场次核心类型定义：创建参数、题目生成结果等数据结构 */
import type { ModelProvider } from "../model-providers/provider.types.js";

/** 难度等级 */
/** 难度等级：初级 / 中级 / 高级 */
export type Difficulty = "初级" | "中级" | "高级";
/** 面试模式：text 文本面试 / voice 语音面试 */
/** 面试模式：text 文本面试 / voice 语音面试 */
export type InterviewMode = "text" | "voice";

export type CreateSessionInput = {
  skillId?: string;
  position: string;
  difficulty: Difficulty;
  jobDescription: string;
  questionCount: number;
  targetCompany: string;
    /** 题目类型分布配置：{ "技术题": 3, "行为题": 2 } */
  questionTypeConfig?: Record<string, number>;
  modelProvider?: ModelProvider["name"];
  modelName?: string;
    /** 用户提供的 API Key（覆盖默认环境变量中的 Key） */
  userApiKey?: string;
  resumeText?: string;
  resumeId?: string;
    /** 简历解析后的上下文摘要（用于出题时参考候选人背景） */
  resumeContext?: string;
  interviewMode?: InterviewMode;
};

export type CreatedSession = {
  id: string;
};

export type GeneratedGenericQuestion = string;

export type GeneratedSkillQuestion = {
  question: string;
  category: string;
};

