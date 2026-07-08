import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// ---- Types ----

type SessionRow = Database["public"]["Tables"]["interview_sessions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["interview_questions"]["Row"];

export type SessionItem = Pick<SessionRow, "id" | "position" | "difficulty" | "status" | "overall_score" | "created_at">;
export type SessionDetail = SessionRow;
export type QuestionItem = QuestionRow;

interface CreateSessionParams {
  position: string;
  difficulty: "初级" | "中级" | "高级";
  jobDescription?: string;
  questionCount?: number;
  targetCompany?: string;
  questionTypeConfig?: Record<string, number>;
  resumeText?: string;
  modelProvider?: "deepseek" | "openai" | "anthropic";
  modelName?: string;
  userApiKey?: string;
}

// ---- Question Bank Types ----

export type BankQuestion = {
  id: string;
  position: string;
  difficulty: string;
  type: string;
  question: string;
  tags: string[];
  created_at: string;
  is_favorited: boolean;
};

interface BankFilters {
  position?: string;
  difficulty?: string;
  type?: string;
  search?: string;
}

// ---- API Client ----

class ApiClient {
  private baseUrl: string;

  constructor() {
    // Default to same-origin (Vite dev proxy handles forwarding in development).
    // Set VITE_API_URL in production to point to the deployed API server.
    this.baseUrl = import.meta.env.VITE_API_URL || "";
  }

  private async getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let message: string;
      try {
        const err = (await res.json()) as { error?: string };
        message = err.error ?? `请求失败 (${res.status})`;
      } catch {
        message = `请求失败 (${res.status})`;
      }
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  // ---- Session APIs ----

  async createInterviewSession(
    params: CreateSessionParams,
  ): Promise<{ sessionId: string }> {
    return this.request("POST", "/api/sessions", params);
  }

  async listSessions(): Promise<SessionItem[]> {
    return this.request("GET", "/api/sessions");
  }

  async getSession(
    sessionId: string,
  ): Promise<{ session: SessionDetail; questions: QuestionItem[] }> {
    return this.request("GET", `/api/sessions/${sessionId}`);
  }

  async finishSession(
    sessionId: string,
  ): Promise<{ overallScore: number; overallFeedback: string }> {
    return this.request("POST", `/api/sessions/${sessionId}/finish`);
  }

  // ---- Question APIs ----

  async sendMessage(
    questionId: string,
    content: string,
  ): Promise<{ response: string; done?: boolean; score?: number; feedback?: string }> {
    return this.request("POST", `/api/questions/${questionId}/message`, {
      content,
    });
  }

  async evaluateConversation(
    questionId: string,
  ): Promise<{ score: number; feedback: string }> {
    return this.request("POST", `/api/questions/${questionId}/evaluate`);
  }

  // ---- Question Bank APIs ----

  async listBankQuestions(filters?: BankFilters): Promise<BankQuestion[]> {
    const params = new URLSearchParams();
    if (filters?.position) params.set("position", filters.position);
    if (filters?.difficulty) params.set("difficulty", filters.difficulty);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString();
    return this.request("GET", `/api/bank` + (qs ? `?` + qs : ""));
  }

  async getBankQuestion(id: string): Promise<BankQuestion> {
    return this.request("GET", `/api/bank/` + id);
  }

  async toggleFavorite(questionId: string): Promise<{ is_favorited: boolean }> {
    return this.request("POST", `/api/bank/` + questionId + `/favorite`);
  }

  async listFavoriteQuestions(): Promise<BankQuestion[]> {
    return this.request("GET", "/api/bank/favorites");
  }
}

export const apiClient = new ApiClient();

