/**
 * 语音 Provider 抽象接口，统一 ASR / TTS 会话生命周期。
 * Phase 5 语音集成：PCM → VoiceProvider ASR → transcript → Agent Graph → message → VoiceProvider TTS → PCM。
 */

/** ASR 会话初始化参数 */
export type AsrSessionConfig = Readonly<{
  /** PCM 采样率（如 16000）。 */
  sampleRate: number;
  /** 可选的取消信号。 */
  signal?: AbortSignal;
}>;

/** ASR 流式事件 */
export type AsrEvent = Readonly<{
  type: "partial" | "final" | "debug";
  text: string;
  confidence: number | null;
}>;

/** 流式 ASR 会话句柄 */
export interface StreamingAsrSession {
  /** ASR 事件流（partial → final 或 debug）。 */
  readonly events: AsyncIterable<AsrEvent>;
  /** 发送一段 PCM 音频。 */
  sendAudio(chunk: Buffer): void;
  /** 标记音频发送完毕，等待最终转录。 */
  finish(): void;
  /** 立即中止会话。 */
  abort(): void;
}

/** TTS 会话初始化参数 */
export type TtsSessionConfig = Readonly<{
  /** PCM 采样率（如 24000）。 */
  sampleRate: number;
  /** 发音人标识。 */
  voice?: string;
}>;

/** 流式 TTS 会话句柄 */
export interface StreamingTtsSession {
  /** 会话是否已关闭。 */
  readonly closed: boolean;
  /**
   * 将文本合成为流式 PCM 音频。
   * @param text - 待合成的文本。
   * @param signal - 可选的取消信号。
   */
  speak(text: string, signal?: AbortSignal): AsyncIterable<Buffer>;
  /** 关闭会话并释放 WebSocket 连接。 */
  close(): void;
}

/** speak 快捷调用参数 */
export type SpeakInput = Readonly<{
  text: string;
}>;

/**
 * VoiceProvider 抽象：将 Qwen / 其他语音引擎封装为统一接口。
 * 调用方不直接依赖 Qwen 类型，Graph 和 Bridge 只引用此接口。
 */
export interface VoiceProvider {
  /** 创建一次性的流式 ASR 会话。 */
  createAsrSession(input: AsrSessionConfig): StreamingAsrSession;
  /** 创建可复用的流式 TTS 会话（支持多轮 speak）。 */
  createTtsSession(input: TtsSessionConfig): StreamingTtsSession;
  /** 快捷单次 TTS 合成，返回流式 PCM。 */
  speak(input: SpeakInput, signal?: AbortSignal): AsyncIterable<Buffer>;
  /** 打断指定 turn 的语音输出。 */
  interrupt(turnId: string): Promise<void>;
  /** 关闭所有语音连接并释放资源。 */
  close(): Promise<void>;
}
