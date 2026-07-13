/** interview-hub：并行获取文字与语音模式级 readiness。 */
import { useAgentReadiness } from "@/features/agent-readiness/hooks/use-agent-readiness";

/**
 * 首页只检查两种入口的创建能力，不请求最近会话或其他业务数据。
 *
 * @returns 文字与语音各自独立的 React Query 结果。
 */
export function useInterviewHub() {
  const text = useAgentReadiness({
    interviewMode: "text",
    modelProvider: "deepseek",
    webResearch: false,
  });
  const voice = useAgentReadiness({
    interviewMode: "voice",
    modelProvider: "deepseek",
    webResearch: false,
  });
  return { text, voice };
}
