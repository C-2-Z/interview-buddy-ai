/** 语音 WebSocket 的有界指数退避策略。 */

/** 根据连续失败次数计算下一次重连等待时间。 */
export function nextVoiceReconnectDelay(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(8_000, 500 * 2 ** normalizedAttempt);
}
