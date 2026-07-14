/** 面试内容阶段指示器：展示当前处于哪个内容阶段（自我介绍/八股/项目/系统设计）。 */
import { useMemo } from "react";
import type { AgentRoleId, AgentSnapshot, AgentWorkspace } from "../types";

/** 面试内容阶段枚举。 */
export type ContentPhase =
  "introduction" | "tech_fundamentals" | "project_deep_dive" | "system_design" | "wrap_up";

/** 各角色的内容阶段配置（与后端 personas.ts 保持同步）。 */
const ROLE_PHASES: Record<AgentRoleId, ContentPhase[]> = {
  general: ["introduction", "tech_fundamentals", "project_deep_dive", "system_design", "wrap_up"],
  technical: ["tech_fundamentals", "project_deep_dive", "system_design"],
  manager: ["project_deep_dive", "system_design"],
  hr: ["wrap_up"],
};

const PHASE_LABELS: Record<ContentPhase, string> = {
  introduction: "开场",
  tech_fundamentals: "基础八股",
  project_deep_dive: "项目深挖",
  system_design: "系统设计",
  wrap_up: "收尾",
};

/** 通过角色计划和当前题号推算内容阶段。 */
function getCurrentPhase(
  questionCount: number,
  currentIndex: number,
  currentRole: AgentRoleId,
): ContentPhase | null {
  if (currentIndex < 0) return null;
  const phases = ROLE_PHASES[currentRole];
  if (!phases || phases.length === 0) return null;
  // 按当前角色的阶段数组长度等比例分配
  const phaseIndex = Math.min(
    Math.floor((currentIndex / Math.max(questionCount, 1)) * phases.length),
    phases.length - 1,
  );
  return phases[phaseIndex];
}

/** 面试内容阶段指示器组件。 */
export function ContentPhaseIndicator({
  snapshot,
  workspace,
}: {
  workspace: AgentWorkspace;
  snapshot: AgentSnapshot;
}) {
  const currentPhase = useMemo(
    () =>
      getCurrentPhase(
        workspace.config.questionCount,
        snapshot.currentQuestionIndex,
        snapshot.currentRole,
      ),
    [snapshot.currentQuestionIndex, snapshot.currentRole, workspace.config.questionCount],
  );

  if (!currentPhase) return null;

  const phases = ROLE_PHASES[snapshot.currentRole] ?? [];
  const phaseIndex = phases.indexOf(currentPhase);

  const phaseColors: Record<ContentPhase, string> = {
    introduction: "bg-sky-100 text-sky-700 border-sky-300",
    tech_fundamentals: "bg-indigo-100 text-indigo-700 border-indigo-300",
    project_deep_dive: "bg-emerald-100 text-emerald-700 border-emerald-300",
    system_design: "bg-amber-100 text-amber-700 border-amber-300",
    wrap_up: "bg-slate-100 text-slate-700 border-slate-300",
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1" aria-label="面试内容阶段">
      {phases.map((phase, idx) => {
        const isActive = idx === phaseIndex;
        const isPast = idx < phaseIndex;
        return (
          <span
            key={phase}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              isActive
                ? phaseColors[phase] + " ring-2 ring-offset-1"
                : isPast
                  ? "bg-gray-100 text-gray-400 border-gray-200 line-through decoration-gray-300"
                  : "bg-white text-gray-400 border-gray-200"
            }`}
          >
            {PHASE_LABELS[phase]}
          </span>
        );
      })}
      <span className="ml-1 text-xs text-muted-foreground">
        第 {snapshot.currentQuestionIndex + 1}/{workspace.config.questionCount} 题
      </span>
    </div>
  );
}
