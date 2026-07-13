/** immersive-voice-interview：委托统一 Agent API，不复制会话或语音协议。 */
export {
  createAgentSession,
  getAgentWorkspace,
  connectAgentVoice,
} from "@/features/interview-agent/api";
export type { AgentVoiceEvent } from "@/features/interview-agent/hooks/use-agent-voice";
