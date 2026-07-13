/** Agent 文字练习新建页：固定 text 通道并保留创建失败草稿。 */
import { useEffect, useState } from "react";
import { Globe, Loader2, Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AgentCreateError } from "@/features/agent-create-recovery/components/agent-create-error";
import { useAgentCreateRecovery } from "@/features/agent-create-recovery/hooks/use-agent-create-recovery";
import type { AgentCreateRecoveryAction } from "@/features/agent-create-recovery/types";
import { AgentReadinessStatus } from "@/features/agent-readiness/components/agent-readiness-status";
import { useAgentReadiness } from "@/features/agent-readiness/hooks/use-agent-readiness";
import type { ReadinessRecoveryAction } from "@/features/agent-readiness/types";
import { useAgentSession } from "../hooks/use-agent-session";
import type { AgentMode, CreateAgentSessionBody } from "../types";

const TEXT_SETUP_DRAFT_KEY = "ezmock:text-interview-setup-draft:v1";

/** 文字练习表单草稿。 */
type SetupDraft = {
  /** 单面试官或多角色面试。 */ mode: AgentMode;
  /** 目标岗位。 */ position: string;
  /** 难度。 */ difficulty: "初级" | "中级" | "高级";
  /** 题目数量。 */ questionCount: number;
  /** 目标公司。 */ targetCompany: string;
  /** 岗位需求描述。 */ jobDescription: string;
  /** 模型供应商。 */ modelProvider: "deepseek" | "openai" | "anthropic";
  /** 是否启用准备阶段联网研究。 */ webResearch: boolean;
};

const INITIAL_DRAFT: SetupDraft = {
  mode: "single",
  position: "",
  difficulty: "中级",
  questionCount: 5,
  targetCompany: "",
  jobDescription: "",
  modelProvider: "deepseek",
  webResearch: false,
};

/** 从浏览器恢复文字配置；无效旧值静默回退为安全默认值。 */
function restoreDraft(): SetupDraft {
  if (typeof window === "undefined") return INITIAL_DRAFT;
  try {
    return {
      ...INITIAL_DRAFT,
      ...(JSON.parse(localStorage.getItem(TEXT_SETUP_DRAFT_KEY) ?? "{}") as Partial<SetupDraft>),
    };
  } catch {
    return INITIAL_DRAFT;
  }
}

/** 文字练习配置页面。 */
export function InterviewAgentSetupPage({
  initialResumeId,
}: {
  /** 从简历详情进入时冻结的简历 UUID。 */ initialResumeId?: string;
}) {
  const navigate = useNavigate();
  const session = useAgentSession();
  const [draft, setDraft] = useState<SetupDraft>(restoreDraft);
  const readiness = useAgentReadiness({
    interviewMode: "text",
    modelProvider: draft.modelProvider,
    webResearch: draft.webResearch,
  });
  const createRecovery = useAgentCreateRecovery();

  useEffect(() => {
    localStorage.setItem(TEXT_SETUP_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  /** 合并一个受控草稿补丁。 */
  function patch(value: Partial<SetupDraft>) {
    setDraft((current) => ({ ...current, ...value }));
  }

  /** 将 readiness 固定恢复动作映射为文字配置页内操作。 */
  function recover(action: ReadinessRecoveryAction) {
    if (action === "open_settings") void navigate({ to: "/settings" });
    else if (action === "disable_research") patch({ webResearch: false });
    else if (action === "retry") void readiness.refetch();
    else if (action === "contact_admin")
      window.location.href = "mailto:support@ezmock.site?subject=文字面试服务支持";
  }

  /** 使用固定 text 通道创建唯一 Agent 会话，失败时不清空任何字段。 */
  async function createFromDraft() {
    if (!readiness.data || readiness.data.status === "blocked" || readiness.isFetching) return;
    createRecovery.clear();
    const body: CreateAgentSessionBody = {
      mode: draft.mode,
      interviewMode: "text",
      position: draft.position.trim(),
      difficulty: draft.difficulty,
      questionCount: draft.questionCount,
      targetCompany: draft.targetCompany.trim() || undefined,
      jobDescription: draft.jobDescription.trim() || undefined,
      resumeId: initialResumeId,
      modelProvider: draft.modelProvider,
      webResearch: draft.webResearch,
    };
    try {
      const sessionId = await session.create(body);
      localStorage.removeItem(TEXT_SETUP_DRAFT_KEY);
      await navigate({ to: "/session/$id", params: { id: sessionId } });
    } catch (error) {
      createRecovery.capture(error);
    }
  }

  /** 阻止浏览器默认提交，并复用可原地重试的创建流程。 */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await createFromDraft();
  }

  /** 执行创建失败协议中的页面动作。 */
  function recoverCreate(action: AgentCreateRecoveryAction) {
    if (action === "retry_create") void createFromDraft();
    else if (action === "open_settings") void navigate({ to: "/settings" });
    else if (action === "recheck") void readiness.refetch();
    else window.location.href = "mailto:support@ezmock.site?subject=文字面试创建失败";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">文字练习模式</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">创建文字练习面试</h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          填写训练目标后逐题作答。配置和回答草稿会在本机保留，创建失败也不会清空。
        </p>
      </header>

      <AgentReadinessStatus
        readiness={readiness.data}
        checking={readiness.isFetching}
        error={readiness.isError}
        onAction={recover}
      />
      {createRecovery.failure && (
        <AgentCreateError
          failure={createRecovery.failure}
          retrying={session.loading}
          onAction={recoverCreate}
        />
      )}

      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>练习配置</CardTitle>
            <CardDescription>
              本页面固定使用文字通道。
              {initialResumeId ? " 已绑定当前简历。" : " 可补充公司与岗位需求，让追问更贴近目标。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="position">目标岗位</Label>
              <Input
                id="position"
                value={draft.position}
                onChange={(event) => patch({ position: event.target.value })}
                placeholder="例如：Java 后端工程师"
                maxLength={100}
                required
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">角色模式</legend>
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
                  技术·主管·HR
                </Button>
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="text-difficulty">难度</Label>
                <Select
                  value={draft.difficulty}
                  onValueChange={(value) =>
                    patch({ difficulty: value as SetupDraft["difficulty"] })
                  }
                >
                  <SelectTrigger id="text-difficulty">
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
                <Label htmlFor="text-question-count">题目数量</Label>
                <Select
                  value={String(draft.questionCount)}
                  onValueChange={(value) => patch({ questionCount: Number(value) })}
                >
                  <SelectTrigger id="text-question-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 8 }, (_, index) => index + 3).map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} 题
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="text-model-provider">模型</Label>
                <Select
                  value={draft.modelProvider}
                  onValueChange={(value) =>
                    patch({ modelProvider: value as SetupDraft["modelProvider"] })
                  }
                >
                  <SelectTrigger id="text-model-provider">
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

            <div className="space-y-2">
              <Label htmlFor="company">目标公司（选填）</Label>
              <Input
                id="company"
                value={draft.targetCompany}
                onChange={(event) => patch({ targetCompany: event.target.value })}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jd">岗位需求描述（选填）</Label>
              <Textarea
                id="jd"
                value={draft.jobDescription}
                onChange={(event) => patch({ jobDescription: event.target.value })}
                maxLength={2000}
                className="min-h-32"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div className="flex gap-3">
                <Globe className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">准备阶段联网研究</div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    只读取公司、岗位与行业来源；不可用时可关闭后继续。
                  </div>
                </div>
              </div>
              <Switch
                aria-label="启用准备阶段联网研究"
                checked={draft.webResearch}
                onCheckedChange={(value) => patch({ webResearch: value })}
              />
            </div>

            <Button
              type="submit"
              className="min-h-12 w-full"
              disabled={
                session.loading ||
                readiness.isFetching ||
                !readiness.data ||
                readiness.data.status === "blocked" ||
                !draft.position.trim()
              }
            >
              {session.loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  正在准备面试
                </>
              ) : readiness.data?.status === "blocked" ? (
                "完成设置后即可开始"
              ) : (
                "创建并开始文字练习"
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
