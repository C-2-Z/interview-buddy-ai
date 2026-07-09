import type { InterviewMessage } from "../questions/messages.repository.js";

export type VoiceClientEvent =
  | {
      type: "audio_start";
      sessionId: string;
      questionId: string;
      turnId: string;
      sampleRate: number;
    }
  | { type: "audio_end"; turnId: string }
  | { type: "interrupt"; questionId: string; turnId: string }
  | { type: "end_question"; questionId: string }
  | { type: "end_session"; sessionId: string };

export type VoiceServerEvent =
  | { type: "ready"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "voice_stage"; stage: string; message: string; turnId?: string }
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
  | {
      type: "question_scored";
      questionId: string;
      score: number;
      feedback: string;
    }
  | { type: "next_question"; questionId: string }
  | {
      type: "session_completed";
      overallScore: number;
      overallFeedback: string;
    };

export type VoiceDecision =
  | { action: "follow_up"; response: string }
  | {
      action: "finish_question";
      response: string;
      score: number;
      feedback: string;
    }
  | { action: "finish_session"; response: string }
  | { action: "redirect"; response: string };

export type VoiceSessionMessagesResponse = {
  messages: InterviewMessage[];
};
