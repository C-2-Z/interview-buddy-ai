/** 公共题库 DB 访问 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import type { BankFilters } from "./bank.schemas.js";

/**
 * 列出 questions
 * @returns 
 */
export async function listQuestions(
  supabase: UserSupabaseClient,
  filters: BankFilters,
) {
  let query = supabase
    .from("question_bank")
    .select("id, position, difficulty, type, question, tags, created_at")
    .order("created_at", { ascending: false });

  if (filters.position) query = query.eq("position", filters.position);
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.search) query = query.ilike("question", `%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * 列出 favorite question ids
 * @returns 
 */
export async function listFavoriteQuestionIds(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("favorite_questions")
    .select("question_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((favorite) => favorite.question_id));
}

/**
 * 列出 favorite questions
 * @returns 
 */
export async function listFavoriteQuestions(
  supabase: UserSupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("favorite_questions")
    .select("question_id, created_at, question_bank(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * 获取 question
 * @returns 
 */
export async function getQuestion(
  supabase: UserSupabaseClient,
  questionId: string,
) {
  const { data, error } = await supabase
    .from("question_bank")
    .select("*")
    .eq("id", questionId)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * 查找 favorite
 * @returns 
 */
export async function findFavorite(
  supabase: UserSupabaseClient,
  userId: string,
  questionId: string,
) {
  const { data, error } = await supabase
    .from("favorite_questions")
    .select("id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * 移除 favorite
 * @returns 
 */
export async function removeFavorite(
  supabase: UserSupabaseClient,
  favoriteId: string,
): Promise<void> {
  const { error } = await supabase
    .from("favorite_questions")
    .delete()
    .eq("id", favoriteId);
  if (error) throw new Error(error.message);
}

/**
 * 添加 favorite
 * @returns 
 */
export async function addFavorite(
  supabase: UserSupabaseClient,
  userId: string,
  questionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("favorite_questions")
    .insert({ user_id: userId, question_id: questionId });
  if (error) throw new Error(error.message);
}

