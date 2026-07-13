/** API client: unified request paths and error handling */
import { getBankQuestion, listBankQuestions, listFavoriteQuestions, toggleFavorite } from "@/features/question-bank/api";
export type { BankFilters, BankQuestion } from "@/features/question-bank/types";
import { getSettings, updateSettings } from "@/features/settings/api";
import { deleteResume, getResume, listResumes, uploadResume } from "@/features/resume-library/api";
export type { ResumeAnalysis, ResumeDetail, ResumeListItem } from "@/features/resume-library/types";

export const apiClient = {
  listBankQuestions, getBankQuestion, toggleFavorite, listFavoriteQuestions,
  getSettings, updateSettings,
  listResumes, getResume, uploadResume, deleteResume,
};
