/** question-bank - 题库查询 */
import { useEffect, useState } from "react";
import {
  listBankQuestions,
  toggleFavorite,
} from "../api";
import type { BankFilters, BankQuestion } from "../types";

export const BANK_POSITIONS = [
  "前端工程师",
  "后端工程师",
  "数据分析师",
  "产品经理",
  "全栈工程师",
  "通用",
];
export const BANK_DIFFICULTIES = ["初级", "中级", "高级"];
export const BANK_TYPES = ["技术题", "行为题", "场景题", "系统设计"];

/**
 * use question bank
 * @returns 
 */
export function useQuestionBank() {
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Required<BankFilters>>({
    position: "",
    difficulty: "",
    type: "",
    search: "",
  });

  /**
   * 加载
   *
   * @param nextFilters - 
   * @returns Promise<
   */
  async function load(nextFilters?: BankFilters) {
    setLoading(true);
    try {
      const data = await listBankQuestions(nextFilters);
      setQuestions(data);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * apply 过滤
   *
   * @param key - 
   * @param value - 
   * @returns 
   */
  function applyFilter(key: keyof Required<BankFilters>, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    const params: BankFilters = {};
    if (next.position) params.position = next.position;
    if (next.difficulty) params.difficulty = next.difficulty;
    if (next.type) params.type = next.type;
    if (next.search) params.search = next.search;
    load(Object.keys(params).length ? params : undefined);
  }

  /**
   * 清空 filters
   * @returns 
   */
  function clearFilters() {
    setFilters({ position: "", difficulty: "", type: "", search: "" });
    load();
  }

  /**
   * 切换 question favorite
   *
   * @param question - 
   * @returns Promise<
   */
  async function toggleQuestionFavorite(question: BankQuestion) {
    try {
      await toggleFavorite(question.id);
      setQuestions((prev) =>
        prev?.map((item) =>
          item.id === question.id
            ? { ...item, is_favorited: !item.is_favorited }
            : item,
        ) ?? null,
      );
    } catch {
      // Keep current UI state if the optimistic toggle fails.
    }
  }

  return {
    questions,
    loading,
    filters,
    applyFilter,
    clearFilters,
    toggleQuestionFavorite,
  };
}

