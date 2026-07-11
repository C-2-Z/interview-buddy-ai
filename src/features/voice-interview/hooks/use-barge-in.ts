/** voice-interview - 打断检测 */
import { useCallback } from "react";

export function useBargeIn(params: {
  speaking: boolean;
  activeTurnId: string | null;
  stopPlayback: () => void;
  sendInterrupt: (turnId: string) => void;
}) {
  return useCallback(() => {
    if (!params.speaking || !params.activeTurnId) return;
    params.stopPlayback();
    params.sendInterrupt(params.activeTurnId);
  }, [params]);
}
