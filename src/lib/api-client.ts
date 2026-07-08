import {
  createInterviewSession,
  listSkills,
} from "@/features/interview-create/api";
export type {
  CreateSessionParams,
  SkillMeta,
} from "@/features/interview-create/types";
import {
  evaluateConversation,
  finishSession,
  getSession,
  listSessions,
  sendMessage,
} from "@/features/interview-session/api";
export type {
  QuestionItem,
  SessionDetail,
  SessionItem,
} from "@/features/interview-session/types";
import {
  getBankQuestion,
  listBankQuestions,
  listFavoriteQuestions,
  toggleFavorite,
} from "@/features/question-bank/api";
export type {
  BankFilters,
  BankQuestion,
} from "@/features/question-bank/types";
import {
  getSettings,
  updateSettings,
} from "@/features/settings/api";

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
};

