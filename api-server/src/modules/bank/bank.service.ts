import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { BankFilters } from "./bank.schemas.js";
import {
  addFavorite,
  findFavorite,
  getQuestion,
  listFavoriteQuestionIds,
  listFavoriteQuestions as listFavoriteQuestionsRepo,
  listQuestions,
  removeFavorite,
} from "./bank.repository.js";

export async function listBankQuestions(params: {
  supabase: UserSupabaseClient;
  userId: string;
  filters: BankFilters;
}) {
  const [questions, favoriteIds] = await Promise.all([
    listQuestions(params.supabase, params.filters),
    listFavoriteQuestionIds(params.supabase, params.userId),
  ]);

  return questions.map((question) => ({
    ...question,
    is_favorited: favoriteIds.has(question.id),
    tags: question.tags ?? [],
  }));
}

export async function listFavoriteBankQuestions(params: {
  supabase: UserSupabaseClient;
  userId: string;
}) {
  const rows = await listFavoriteQuestionsRepo(params.supabase, params.userId);
  return rows.map((favorite) => ({
    ...(favorite.question_bank as Record<string, unknown>),
    favorited_at: favorite.created_at,
    is_favorited: true,
  }));
}

export async function getBankQuestion(params: {
  supabase: UserSupabaseClient;
  userId: string;
  questionId: string;
}) {
  const question = await getQuestion(params.supabase, params.questionId);
  if (!question) return null;
  const favorite = await findFavorite(
    params.supabase,
    params.userId,
    params.questionId,
  );
  return {
    ...question,
    tags: question.tags ?? [],
    is_favorited: favorite !== null,
  };
}

export async function toggleFavorite(params: {
  supabase: UserSupabaseClient;
  userId: string;
  questionId: string;
}) {
  const question = await getQuestion(params.supabase, params.questionId);
  if (!question) return null;

  const existing = await findFavorite(
    params.supabase,
    params.userId,
    params.questionId,
  );
  if (existing) {
    await removeFavorite(params.supabase, existing.id);
    return { is_favorited: false };
  }

  await addFavorite(params.supabase, params.userId, params.questionId);
  return { is_favorited: true };
}

