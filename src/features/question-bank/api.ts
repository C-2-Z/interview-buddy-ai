import { apiRequest } from "@/shared/api/http-client";
import type { BankFilters, BankQuestion } from "./types";

export function listBankQuestions(filters?: BankFilters): Promise<BankQuestion[]> {
  const params = new URLSearchParams();
  if (filters?.position) params.set("position", filters.position);
  if (filters?.difficulty) params.set("difficulty", filters.difficulty);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.search) params.set("search", filters.search);
  const query = params.toString();
  return apiRequest("GET", `/api/bank${query ? `?${query}` : ""}`);
}

export function getBankQuestion(id: string): Promise<BankQuestion> {
  return apiRequest("GET", `/api/bank/${id}`);
}

export function toggleFavorite(
  questionId: string,
): Promise<{ is_favorited: boolean }> {
  return apiRequest("POST", `/api/bank/${questionId}/favorite`);
}

export function listFavoriteQuestions(): Promise<BankQuestion[]> {
  return apiRequest("GET", "/api/bank/favorites");
}

