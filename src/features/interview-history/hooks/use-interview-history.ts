import { useCallback, useEffect, useMemo, useState } from "react";
import { listInterviewHistory } from "../api";
import { isVoiceSession, type InterviewHistoryFilters, type InterviewHistoryItem } from "../types";

const DEFAULT_FILTERS: InterviewHistoryFilters = {
  query: "",
  mode: "all",
  status: "all",
  difficulty: "all",
};

const FILTER_STORAGE_KEY = "ezmock:interview-history:filters";

function readStoredFilters(): InterviewHistoryFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const stored = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
    return stored
      ? { ...DEFAULT_FILTERS, ...(JSON.parse(stored) as Partial<InterviewHistoryFilters>) }
      : DEFAULT_FILTERS;
  } catch {
    window.sessionStorage.removeItem(FILTER_STORAGE_KEY);
    return DEFAULT_FILTERS;
  }
}

export function useInterviewHistory() {
  const [items, setItems] = useState<InterviewHistoryItem[]>([]);
  const [filters, setFilters] = useState(readStoredFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listInterviewHistory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载面试记录失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return items.filter((item) => {
      if (query && !item.position.toLowerCase().includes(query)) return false;
      if (filters.mode !== "all" && (isVoiceSession(item) ? "voice" : "text") !== filters.mode)
        return false;
      if (filters.status !== "all") {
        const status = item.status === "completed" ? "completed" : "active";
        if (status !== filters.status) return false;
      }
      return filters.difficulty === "all" || item.difficulty === filters.difficulty;
    });
  }, [filters, items]);

  return {
    items,
    filteredItems,
    filters,
    setFilter: <Key extends keyof InterviewHistoryFilters>(
      key: Key,
      value: InterviewHistoryFilters[Key],
    ) => setFilters((current) => ({ ...current, [key]: value })),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    loading,
    error,
    refresh,
  };
}
