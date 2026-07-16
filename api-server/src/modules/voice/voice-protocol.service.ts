/** 语音 WebSocket 协议版本、幂等游标与连接级资源保护。 */

/** 当前客户端与服务端共同支持的协议版本。 */
export const VOICE_PROTOCOL_VERSION = 1;

/** 单条连接允许使用的资源边界。 */
export type VoiceConnectionLimits = Readonly<{
  /** 未收到客户端心跳前允许的最长毫秒数。 */
  heartbeatTimeoutMs: number;
  /** 单次回答允许持续的最长毫秒数。 */
  maxAnswerDurationMs: number;
  /** 单次回答允许上传的 PCM 总字节数。 */
  maxAudioBytes: number;
  /** audio_start 验证完成前允许暂存的 PCM 字节数。 */
  maxPendingAudioBytes: number;
  /** 为事件幂等保留的最近 eventId 数量。 */
  maxProcessedEventIds: number;
}>;

/** 接收音频后的资源检查结果。 */
export type VoiceAudioAcceptance =
  | "accepted"
  | "audio_limit"
  | "pending_limit"
  | "duration_limit";

/** 单条语音连接的纯内存控制状态，不保存回答正文或音频。 */
export type VoiceConnectionState = {
  /** 接受严格递增且从未处理过的控制事件。 */
  acceptEvent(eventId: string, sequence: number): boolean;
  /** 更新最近一次客户端存活时间。 */
  markHeartbeat(now: number): void;
  /** 判断客户端是否已经超过心跳窗口。 */
  isHeartbeatExpired(now: number): boolean;
  /** 为新回答重置计时和字节计数。 */
  startTurn(turnId: string, now: number): void;
  /** 在送入 Provider 前检查回答时长、总量和验证期缓冲。 */
  acceptAudio(bytes: number, pending: boolean, now: number): VoiceAudioAcceptance;
};

/** 创建可独立测试的连接状态，供 WebSocket 入口保持薄控制流。 */
export function createVoiceConnectionState(
  limits: VoiceConnectionLimits,
  connectedAt = Date.now(),
): VoiceConnectionState {
  let lastHeartbeatAt = connectedAt;
  let latestSequence = 0;
  let activeTurnId: string | null = null;
  let turnStartedAt = connectedAt;
  let audioBytes = 0;
  let pendingBytes = 0;
  const processedEventIds = new Set<string>();
  const eventOrder: string[] = [];

  return {
    acceptEvent(eventId, sequence) {
      if (!eventId || processedEventIds.has(eventId) || sequence <= latestSequence) return false;
      processedEventIds.add(eventId);
      eventOrder.push(eventId);
      latestSequence = sequence;
      // 只保留有界窗口；旧事件仍会被 sequence 游标拒绝。
      while (eventOrder.length > limits.maxProcessedEventIds) {
        const expiredId = eventOrder.shift();
        if (expiredId) processedEventIds.delete(expiredId);
      }
      return true;
    },
    markHeartbeat(now) {
      lastHeartbeatAt = now;
    },
    isHeartbeatExpired(now) {
      return now - lastHeartbeatAt > limits.heartbeatTimeoutMs;
    },
    startTurn(turnId, now) {
      activeTurnId = turnId;
      turnStartedAt = now;
      audioBytes = 0;
      pendingBytes = 0;
    },
    acceptAudio(bytes, pending, now) {
      if (!activeTurnId || now - turnStartedAt > limits.maxAnswerDurationMs) {
        return "duration_limit";
      }
      if (audioBytes + bytes > limits.maxAudioBytes) return "audio_limit";
      if (pending && pendingBytes + bytes > limits.maxPendingAudioBytes) return "pending_limit";
      audioBytes += bytes;
      if (pending) pendingBytes += bytes;
      return "accepted";
    },
  };
}
