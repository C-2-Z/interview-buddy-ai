/** immersive-voice-interview：语音服务与浏览器设备检查后的精简候场页。 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  AudioLines,
  Check,
  Headphones,
  Loader2,
  Mic,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentCreateError } from "@/features/agent-create-recovery/components/agent-create-error";
import { useAgentCreateRecovery } from "@/features/agent-create-recovery/hooks/use-agent-create-recovery";
import type { AgentCreateRecoveryAction } from "@/features/agent-create-recovery/types";
import { AgentMemoryToggle } from "@/features/agent-memory/components/agent-memory-toggle";
import { AgentReadinessStatus } from "@/features/agent-readiness/components/agent-readiness-status";
import { useAgentReadiness } from "@/features/agent-readiness/hooks/use-agent-readiness";
import type { ReadinessRecoveryAction } from "@/features/agent-readiness/types";
import { useAgentSession } from "@/features/interview-agent/hooks/use-agent-session";
import { useBrains } from "@/features/knowledge/hooks/use-brains";
import { INITIAL_VOICE_LOBBY_DRAFT } from "../constants";
import { useFullscreenSession } from "../hooks/use-fullscreen-session";
import { useVoiceDevicePreflight } from "../hooks/use-voice-device-preflight";
import { platformAdapter } from "@/shared/platform/platform-adapter";
import type { VoiceLobbyDraft } from "../types";

const VOICE_LOBBY_DRAFT_KEY = "ezmock:voice-lobby-draft:v1";

/** 从浏览器恢复语音候场草稿。 */
function restoreVoiceDraft(): VoiceLobbyDraft {
  if (typeof window === "undefined") return INITIAL_VOICE_LOBBY_DRAFT;
  try {
    return {
      ...INITIAL_VOICE_LOBBY_DRAFT,
      ...(JSON.parse(
        localStorage.getItem(VOICE_LOBBY_DRAFT_KEY) ?? "{}",
      ) as Partial<VoiceLobbyDraft>),
    };
  } catch {
    return INITIAL_VOICE_LOBBY_DRAFT;
  }
}

/** 在用户手势内唤醒一次 AudioContext，降低进入房间后的自动播放拦截概率。 */
async function primeAudioPlayback(): Promise<void> {
  let context: AudioContext;
  try {
    context = platformAdapter.voice.createAudioContext();
  } catch {
    return;
  }
  try {
    await context.resume();
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** 沉浸语音候场页面。 */
export function ImmersiveVoiceLobby() {
  const navigate = useNavigate();
  const session = useAgentSession();
  const brains = useBrains();
  const createRecovery = useAgentCreateRecovery();
  const device = useVoiceDevicePreflight();
  const fullscreen = useFullscreenSession();
  const [draft, setDraft] = useState<VoiceLobbyDraft>(restoreVoiceDraft);
  const [entering, setEntering] = useState(false);
  const readiness = useAgentReadiness({
    interviewMode: "voice",
    modelProvider: draft.modelProvider,
    webResearch: true,
  });

  useEffect(() => {
    localStorage.setItem(VOICE_LOBBY_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  /** 合并候场表单补丁。 */
  function patch(value: Partial<VoiceLobbyDraft>) {
    setDraft((current) => ({ ...current, ...value }));
  }

  /** 执行 readiness 建议动作。 */
  function recoverReadiness(action: ReadinessRecoveryAction) {
    if (action === "open_settings") void navigate({ to: "/settings" });
    else if (action === "use_text") void navigate({ to: "/new" });
    else if (action === "retry") void readiness.refetch();
    else if (action === "contact_admin")
      window.location.href = "mailto:support@ezmock.site?subject=语音面试服务支持";
  }

  /** 在同一次用户手势内并行触发全屏、音频解锁与麦克风授权，再创建 voice session。 */
  async function enterInterview() {
    if (
      !draft.position.trim() ||
      readiness.data?.status === "blocked" ||
      !readiness.data ||
      entering
    )
      return;
    setEntering(true);
    createRecovery.clear();
    const fullscreenRequest = fullscreen.request();
    const playbackRequest = primeAudioPlayback();
    const microphoneRequest = device.requestMicrophone();
    const microphoneReady = await microphoneRequest;
    await Promise.allSettled([fullscreenRequest, playbackRequest]);
    if (!microphoneReady) {
      setEntering(false);
      return;
    }
    try {
      const sessionId = await session.create({
        mode: draft.mode,
        interviewMode: "voice",
        position: draft.position.trim(),
        difficulty: draft.difficulty,
        questionCount: draft.questionCount,
        targetCompany: draft.targetCompany.trim() || undefined,
        modelProvider: draft.modelProvider,
        webResearch: true,
        brainId: draft.brainId || undefined,
        useTrainingMemory: draft.useTrainingMemory,
      });
      localStorage.removeItem(VOICE_LOBBY_DRAFT_KEY);
      await navigate({ to: "/voice/session/$id", params: { id: sessionId } });
    } catch (error) {
      createRecovery.capture(error);
      setEntering(false);
    }
  }

  /** 执行创建失败恢复动作。 */
  function recoverCreate(action: AgentCreateRecoveryAction) {
    if (action === "retry_create") void enterInterview();
    else if (action === "open_settings") void navigate({ to: "/settings" });
    else if (action === "recheck") void readiness.refetch();
    else window.location.href = "mailto:support@ezmock.site?subject=语音面试创建失败";
  }

  const deviceBlocked = Boolean(device.preflight.error);
  const canEnter = Boolean(
    draft.position.trim() &&
    readiness.data &&
    readiness.data.status !== "blocked" &&
    !deviceBlocked &&
    !readiness.isFetching &&
    !entering,
  );

  return (
    <main className="min-h-dvh overflow-x-hidden bg-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => void navigate({ to: "/interview-hub" })}
        >
          <ArrowLeft />
          返回模式选择
        </Button>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section>
            <p className="text-sm font-medium text-primary">语音面试</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">准备进入语音面试</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              进入后系统会自动播报、聆听并推进问答。请在安静环境中佩戴耳机，避免扬声器回声影响识别。
            </p>

            <Card className="mt-7">
              <CardHeader>
                <CardTitle>本场面试</CardTitle>
                <CardDescription>
                  只保留进入模拟所需的必要配置，高级练习选项可在文字模式中使用。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="voice-position">目标岗位</Label>
                  <Input
                    id="voice-position"
                    value={draft.position}
                    onChange={(event) => patch({ position: event.target.value })}
                    placeholder="例如：前端工程师"
                    maxLength={100}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="voice-difficulty">难度</Label>
                    <Select
                      value={draft.difficulty}
                      onValueChange={(value) =>
                        patch({ difficulty: value as VoiceLobbyDraft["difficulty"] })
                      }
                    >
                      <SelectTrigger id="voice-difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="初级">初级</SelectItem>
                        <SelectItem value="中级">中级</SelectItem>
                        <SelectItem value="高级">高级</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voice-question-count">题目数量</Label>
                    <Select
                      value={String(draft.questionCount)}
                      onValueChange={(value) => patch({ questionCount: Number(value) })}
                    >
                      <SelectTrigger id="voice-question-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[3, 4, 5, 6, 7, 8].map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count} 题
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voice-model">模型</Label>
                    <Select
                      value={draft.modelProvider}
                      onValueChange={(value) =>
                        patch({ modelProvider: value as VoiceLobbyDraft["modelProvider"] })
                      }
                    >
                      <SelectTrigger id="voice-model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">面试官模式</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={draft.mode === "single" ? "default" : "outline"}
                      onClick={() => patch({ mode: "single" })}
                    >
                      <Users />
                      单面试官
                    </Button>
                    <Button
                      type="button"
                      variant={draft.mode === "panel" ? "default" : "outline"}
                      onClick={() => patch({ mode: "panel" })}
                    >
                      <Users />
                      多角色面试
                    </Button>
                  </div>
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor="voice-company">目标公司（选填）</Label>
                  <Input
                    id="voice-company"
                    value={draft.targetCompany}
                    onChange={(event) => patch({ targetCompany: event.target.value })}
                    maxLength={100}
                  />
                </div>
                <>
                <div className="space-y-2">
                  <Label htmlFor="voice-brain">面试知识库 Brain（选填）</Label>
                  <Select
                    value={draft.brainId || "none"}
                    onValueChange={(value) => patch({ brainId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger id="voice-brain">
                      <SelectValue placeholder="不绑定知识库" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定知识库</SelectItem>
                      {(brains.data?.brains ?? []).map((brain) => (
                        <SelectItem key={brain.id} value={brain.id}>
                          {brain.name}（{brain.documentCount} 篇资料）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <AgentMemoryToggle
                  checked={draft.useTrainingMemory}
                  onCheckedChange={(value) => patch({ useTrainingMemory: value })}
                />
                </>
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <AgentReadinessStatus
              readiness={readiness.data}
              checking={readiness.isFetching}
              error={readiness.isError}
              onAction={recoverReadiness}
            />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">浏览器与设备</CardTitle>
                <CardDescription>服务端 readiness 与本机麦克风分别检查。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3" aria-live="polite">
                <PreflightItem
                  icon={ShieldCheck}
                  label="安全连接"
                  ready={device.preflight.secureContext}
                />
                <PreflightItem
                  icon={Mic}
                  label="麦克风设备"
                  ready={
                    device.preflight.microphoneDetected !== false &&
                    device.preflight.mediaDevicesSupported
                  }
                  pending={device.preflight.microphoneDetected === null}
                />
                <PreflightItem
                  icon={AudioLines}
                  label="麦克风权限"
                  ready={device.preflight.permission === "granted"}
                  pending={
                    device.preflight.permission === "unknown" ||
                    device.preflight.permission === "prompt"
                  }
                />
                <PreflightItem icon={Headphones} label="建议佩戴耳机" ready />
                {device.preflight.error && (
                  <div
                    className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive"
                    role="alert"
                  >
                    {device.preflight.error}
                  </div>
                )}
                {fullscreen.error && (
                  <p className="text-xs leading-5 text-muted-foreground">{fullscreen.error}</p>
                )}
              </CardContent>
            </Card>

            {createRecovery.failure && (
              <AgentCreateError
                failure={createRecovery.failure}
                retrying={session.loading}
                onAction={recoverCreate}
              />
            )}
            <Button
              className="min-h-12 w-full"
              disabled={!canEnter}
              onClick={() => void enterInterview()}
            >
              {entering || session.loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  正在进入面试
                </>
              ) : (
                "进入沉浸式面试"
              )}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 w-full"
              onClick={() => void navigate({ to: "/new" })}
            >
              语音暂不可用？切换文字练习
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              进入后会请求全屏；若浏览器拒绝，仍可使用全窗口模式继续。转写文本按回答记录保存，原始音频默认不存储。
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

/** 单条设备预检结果。 */
function PreflightItem({
  icon: Icon,
  label,
  ready,
  pending = false,
}: {
  /** Lucide 图标。 */ icon: typeof Check;
  /** 检查名称。 */ label: string;
  /** 是否通过。 */ ready: boolean;
  /** 是否等待用户手势确认。 */ pending?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted/50 px-3">
      <span className="flex items-center gap-2 text-sm">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <span className="flex items-center gap-1 text-xs font-medium">
        {pending ? (
          "进入时确认"
        ) : ready ? (
          <>
            <Check className="size-3.5" />
            通过
          </>
        ) : (
          "未通过"
        )}
      </span>
    </div>
  );
}
