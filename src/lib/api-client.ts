/** API 客户端：统一请求路径和错误处理 */
import { createInterviewSession, listSkills } from "@/features/interview-create/api";
export type { CreateSessionParams, SkillMeta } from "@/features/interview-create/types";
import {
  evaluateConversation,
  finishSession,
  getSession,
  listSessions,
  sendMessage,
} from "@/features/interview-session/api";
export type { QuestionItem, SessionDetail, SessionItem } from "@/features/interview-session/types";
import {
  getBankQuestion,
  listBankQuestions,
  listFavoriteQuestions,
  toggleFavorite,
} from "@/features/question-bank/api";
export type { BankFilters, BankQuestion } from "@/features/question-bank/types";
import { getSettings, updateSettings } from "@/features/settings/api";
import { deleteResume, getResume, listResumes, uploadResume } from "@/features/resume-library/api";
export type { ResumeAnalysis, ResumeDetail, ResumeListItem } from "@/features/resume-library/types";
import {
  connectVoiceSession,
  createVoiceInterviewSession,
  endVoiceSession,
  getVoiceSession,
  listVoiceMessages,
} from "@/features/voice-interview/api";
export type { VoiceMessage, VoiceServerEvent } from "@/features/voice-interview/types";

export const apiClient = {
  createInterviewSession,
  listSkills,
  listSessions,
  getSession,
  finishSession,
  sendMessage,
  evaluateConversation,
  listBankQuestions,
  getBankQuestion,
  toggleFavorite,
  listFavoriteQuestions,
  getSettings,
  updateSettings,
  listResumes,
  getResume,
  uploadResume,
  deleteResume,
  createVoiceInterviewSession,
  getVoiceSession,
  connectVoiceSession,
  listVoiceMessages,
  endVoiceSession,
};
