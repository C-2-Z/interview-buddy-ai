/** Supabase 数据库行类型定义 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      interview_questions: {
        Row: {
          answer: string | null
          created_at: string
          feedback: string | null
          id: string
          order_index: number
          question: string
          score: number | null
          skill_id: string | null
          topic_summary: string | null
        session_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          order_index: number
          question: string
          score?: number | null
          skill_id?: string | null
          topic_summary?: string | null
        session_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          order_index?: number
          question?: string
          score?: number | null
          skill_id?: string | null
          topic_summary?: string | null
        session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_messages: {
        Row: {
          audio_url: string | null
          id: string
          question_id: string
          role: string
          content: string
          created_at: string
          ended_at: string | null
          interrupted: boolean | null
          source: string | null
          started_at: string | null
          stt_confidence: number | null
          turn_id: string | null
        }
        Insert: {
          audio_url?: string | null
          id?: string
          question_id: string
          role: string
          content: string
          created_at?: string
          ended_at?: string | null
          interrupted?: boolean | null
          source?: string | null
          started_at?: string | null
          stt_confidence?: number | null
          turn_id?: string | null
        }
        Update: {
          audio_url?: string | null
          id?: string
          question_id?: string
          role?: string
          content?: string
          created_at?: string
          ended_at?: string | null
          interrupted?: boolean | null
          source?: string | null
          started_at?: string | null
          stt_confidence?: number | null
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          created_at: string
          difficulty: string
          generated_count: number
          generation_completed_at: string | null
          generation_error: string | null
          generation_started_at: string | null
          generation_status: string
          id: string
          interview_mode: string
          job_description: string | null
          last_activity_at: string | null
          model_name: string | null
          model_provider: string | null
          overall_feedback: string | null
          overall_score: number | null
          position: string
          question_type_config: Json | null
          report_status: string
          requested_count: number
          resume_text: string | null
          skill_id: string | null
          status: string
          target_company: string | null
          user_api_key: string | null
          user_id: string
          voice_mode: boolean | null
        }
        Insert: {
          created_at?: string
          difficulty: string
          generated_count?: number
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          interview_mode?: string
          job_description?: string | null
          last_activity_at?: string | null
          model_name?: string | null
          model_provider?: string | null
          overall_feedback?: string | null
          overall_score?: number | null
          position: string
          question_type_config?: Json | null
          report_status?: string
          requested_count?: number
          resume_text?: string | null
          skill_id?: string | null
          status?: string
          target_company?: string | null
          user_api_key?: string | null
          user_id: string
          voice_mode?: boolean | null
        }
        Update: {
          created_at?: string
          difficulty?: string
          generated_count?: number
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          interview_mode?: string
          job_description?: string | null
          last_activity_at?: string | null
          model_name?: string | null
          model_provider?: string | null
          overall_feedback?: string | null
          overall_score?: number | null
          position?: string
          question_type_config?: Json | null
          report_status?: string
          requested_count?: number
          resume_text?: string | null
          skill_id?: string | null
          status?: string
          target_company?: string | null
          user_api_key?: string | null
          user_id?: string
          voice_mode?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          created_at: string
          difficulty: string
          id: string
          position: string
          question: string
          tags: string[] | null
          type: string
        }
        Insert: {
          created_at?: string
          difficulty: string
          id?: string
          position: string
          question: string
          tags?: string[] | null
          type: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          id?: string
          position?: string
          question?: string
          tags?: string[] | null
          type?: string
        }
        Relationships: []
      }
      favorite_questions: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'favorite_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_bank'
            referencedColumns: ['id']
          },
        ]
      }
      user_settings: {
        Row: {
          anthropic_api_key: string | null
          created_at: string
          deepseek_api_key: string | null
          id: string
          model_name: string | null
          model_provider: string | null
          openai_api_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          created_at?: string
          deepseek_api_key?: string | null
          id?: string
          model_name?: string | null
          model_provider?: string | null
          openai_api_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          created_at?: string
          deepseek_api_key?: string | null
          id?: string
          model_name?: string | null
          model_provider?: string | null
          openai_api_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const


