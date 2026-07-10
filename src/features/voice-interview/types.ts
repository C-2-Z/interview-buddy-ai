import type { Message, QuestionItem } from "@/features/interview-session/types";

export type VoiceServerEvent =
  | { type: "ready"; sessionId: string }
  | {
      type: "session_ready";
      sessionId: string;
      questionId: string | null;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | {
      type: "error";
      message: string;
      code?: string;
      stage?: string;
      turnId?: string;
      retryable?: boolean;
      detail?: string;
    }
  | { type: "voice_stage"; stage: string; message: string; turnId?: string }
  | {
      type: "interviewer_prompt_start";
      turnId: string;
      questionId: string;
      text: string;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | { type: "interviewer_prompt_end"; turnId: string; questionId: string }
  | { type: "transcript_partial"; text: string; turnId: string }
  | { type: "transcript_final"; text: string; turnId: string }
  | { type: "assistant_text"; text: string; turnId: string }
  | { type: "assistant_text_delta"; text: string; turnId: string }
  | { type: "assistant_text_done"; turnId: string }
  | { type: "assistant_audio_start"; turnId: string; sampleRate: number }
  | {
      type: "assistant_audio_chunk";
      turnId: string;
      sequence: number;
      byteLength: number;
    }
  | { type: "assistant_audio_end"; turnId: string }
  | { type: "interrupted"; turnId: string }
  | { type: "generation_cancelled"; turnId: string }
  | { type: "question_scored"; questionId: string; score: number; feedback: string }
  | {
      type: "next_question";
      questionId: string;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | { type: "session_completed"; overallScore: number; overallFeedback: string };

export type VoiceMessage = Message & {
  source?: "text" | "voice";
  interrupted?: boolean;
  turn_id?: string | null;
};

export type VoicePanelQuestion = Pick<QuestionItem, "id" | "question" | "score">;
