/** 追问轮次指示器：展示当前题目的追问深度阶段。 */
import { useMemo } from "react";
import type { AgentSnapshot, AgentWorkspace, AgentWorkspaceMessage } from "../types";

/** 追问轮次类型。 */
export type QuestionRoundType = "broad_opening" | "keyword_deep_dive" | "stress_test";

const ROUND_LABELS: Record<QuestionRoundType, string> = {
  broad_opening: "宽泛提问",
  keyword_deep_dive: "关键词深挖",
  stress_test: "压力测试",
};

const ROUND_COLORS: Record<QuestionRoundType, string> = {
  broad_opening: "bg-blue-100 text-blue-700 border-blue-300",
  keyword_deep_dive: "bg-violet-100 text-violet-700 border-violet-300",
  stress_test: "bg-red-100 text-red-700 border-red-300",
};

/** 根据追问次数推算当前轮次类型。 */
function inferRoundType(
  followUpCount: number,
  messages: AgentWorkspaceMessage[],
): QuestionRoundType {
  if (followUpCount === 0) return "broad_opening";
  // 检查最近一轮 assistant 消息是否包含对比/选择/替代等压力测试信号
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && /为什么选|对比|替代|区别|重新选/m.test(lastAssistant.content)) {
    return "stress_test";
  }
  // 检查最近一轮是否有技术关键词被追问
  if (lastAssistant && /[A-Z][A-Za-z0-9]+/.test(lastAssistant.content)) {
    return "keyword_deep_dive";
  }
  // followUpCount >= 2 且无明确信号时默认压力测试
  if (followUpCount >= 2) return "stress_test";
  return followUpCount === 1 ? "keyword_deep_dive" : "broad_opening";
}

/** 追问轮次指示器组件。 */
export function RoundIndicator({
  snapshot,
  workspace,
}: {
  snapshot: AgentSnapshot;
  workspace: AgentWorkspace;
}) {
  const currentQuestion = workspace.questions[snapshot.currentQuestionIndex];
  const roundType = useMemo(
    () => inferRoundType(snapshot.followUpCount, currentQuestion?.messages ?? []),
    [snapshot.followUpCount, currentQuestion],
  );

  // 第一题首轮不显示
  if (snapshot.followUpCount === 0 && snapshot.currentQuestionIndex === 0) return null;
  // 已完成/失败/评分中不显示
  if (["completed", "failed", "scoring", "reporting"].includes(snapshot.phase)) return null;

  const rounds: QuestionRoundType[] = ["broad_opening", "keyword_deep_dive", "stress_test"];
  const currentIndex = rounds.indexOf(roundType);

  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="追问深度">
      {rounds.map((round, idx) => {
        const isActive = idx === currentIndex;
        const isPast = idx < currentIndex;
        return (
          <div key={round} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span className={`text-xs ${isPast ? "text-gray-300" : "text-gray-400"}`}>→</span>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                isActive
                  ? ROUND_COLORS[round] + " ring-2 ring-offset-1"
                  : isPast
                    ? "bg-gray-100 text-gray-400 border-gray-200"
                    : "bg-white text-gray-300 border-gray-200"
              }`}
            >
              {ROUND_LABELS[round]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
