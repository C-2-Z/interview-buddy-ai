/** interview-hub：首页只组合文字练习与沉浸语音两个核心入口。 */
import { InterviewHomeAccountMenu } from "./interview-home-account-menu";
import { InterviewModePanel } from "./interview-mode-panel";
import { useInterviewHub } from "../hooks/use-interview-hub";
import { INTERVIEW_HOME_MODES } from "../constants";

// 首页业务区域只渲染两个同等权重的模式面板，不加载历史、报告或简历数据。
export function InterviewHubPage() {
  const hub = useInterviewHub();

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--color-primary)_10%,transparent),transparent_42%),radial-gradient(circle_at_bottom_right,color-mix(in_oklch,var(--color-chart-2)_8%,transparent),transparent_38%)]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-sm"
              aria-hidden="true"
            >
              E
            </span>
            <div>
              <div className="font-semibold tracking-tight">EZMock</div>
              <div className="text-xs text-muted-foreground">AI 面试训练</div>
            </div>
          </div>
          <InterviewHomeAccountMenu />
        </header>

        <section
          className="flex flex-1 flex-col justify-center py-10 sm:py-14"
          aria-labelledby="interview-mode-heading"
        >
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
            <p className="mb-3 text-sm font-medium text-primary">选择今天的训练方式</p>
            <h1
              id="interview-mode-heading"
              className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            >
              一套面试能力，两种练习节奏
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              文字模式适合深入推敲，语音模式还原真实交流。两种方式共享同一套 Agent 与复盘报告。
            </p>
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:gap-6">
            <InterviewModePanel
              mode={INTERVIEW_HOME_MODES.text}
              readiness={hub.text.data}
              checking={hub.text.isFetching}
              error={hub.text.isError}
              onRetry={() => void hub.text.refetch()}
            />
            <InterviewModePanel
              mode={INTERVIEW_HOME_MODES.voice}
              readiness={hub.voice.data}
              checking={hub.voice.isFetching}
              error={hub.voice.isError}
              onRetry={() => void hub.voice.refetch()}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
