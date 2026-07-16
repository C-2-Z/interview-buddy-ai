/** Agent 语音 WebSocket 控制与输出事件类型。 */

/** 每个控制事件都携带的协议元数据。 */
export type VoiceEventMetadata = {
  /** 协议主版本。 */ protocolVersion: 1;
  /** 连接内唯一事件 ID。 */ eventId: string;
  /** 连接内严格递增序号。 */ sequence: number;
};

export type VoiceClientEvent = VoiceEventMetadata & (
  | { type: "hello"; sessionId: string }
  | { type: "heartbeat" }
  | { type: "resume_session"; sessionId: string; lastServerSequence: number }
  | { type: "prompt_question"; questionId: string }
  | { type: "playback_completed"; turnId: string }
  | {
      type: "audio_start";
      sessionId: string;
      questionId: string;
      turnId: string;
      sampleRate: number;
    }
  | { type: "audio_end"; turnId: string }
  | { type: "interrupt"; questionId: string; turnId: string }
);

/** 服务端事件不含统一传输元数据的业务载荷。 */
export type VoiceServerEventPayload =
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
  | {
      type: "question_scored";
      questionId: string;
      score: number;
      feedback: string;
    }
  | {
      type: "next_question";
      questionId: string;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | {
      type: "session_completed";
      overallScore: number;
      overallFeedback: string;
    }
  | { type: "connection_state"; state: "connected" | "resumed" | "closing" }
  | {
      type: "resume_snapshot";
      sessionId: string;
      questionId: string | null;
      currentQuestionIndex: number;
      totalQuestions: number;
    }
  | { type: "rate_limited"; code: string; message: string; turnId?: string }
  | { type: "turn_rejected"; code: string; message: string; turnId: string };

/** 实际在线路上传输的服务端事件。 */
export type VoiceServerEvent = VoiceEventMetadata & VoiceServerEventPayload;
