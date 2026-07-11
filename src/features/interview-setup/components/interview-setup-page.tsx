/** interview-setup - 面试设置页面 */
import { ChevronDown, FileText, Keyboard, Loader2, Mic2, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "@/features/interview-create/components/model-selector";
import { ResumeUpload } from "@/features/interview-create/components/resume-upload";
import { SkillSelector } from "@/features/interview-create/components/skill-selector";
import { SkillTags } from "@/features/interview-create/components/skill-tags";
import { QUESTION_COUNTS } from "@/features/interview-create/constants";
import { useInterviewSetup } from "../hooks/use-interview-setup";
import type { InterviewSetupMode, InterviewSetupSearch } from "../types";

/**
 * interview setup page
 * @returns
 */
export function InterviewSetupPage({
  mode,
  search,
}: {
  mode: InterviewSetupMode;
  search: InterviewSetupSearch;
}) {
  const setup = useInterviewSetup(mode, search);
  const isVoice = mode === "voice";
  const ModeIcon = isVoice ? Mic2 : Keyboard;

  if (setup.hydrating) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-label="正在加载面试配置">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[28rem] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ModeIcon className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            配置{isVoice ? "语音" : "文本"}面试
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isVoice
              ? "AI 面试官会主动提问、实时听答，并按真实节奏推进面试。"
              : "选择面试方向并设置练习强度，AI 会生成适合文字深度表达的问题。"}
          </p>
        </div>
      </header>

      <div className="space-y-2" aria-label={`第 ${setup.step} 步，共 2 步`}>
        <div className="flex items-center justify-between text-xs font-medium">
          <span className={setup.step === 1 ? "text-primary" : "text-muted-foreground"}>
            1. 面试方向
          </span>
          <span className={setup.step === 2 ? "text-primary" : "text-muted-foreground"}>
            2. 练习配置
          </span>
        </div>
        <Progress value={setup.step * 50} className="h-1.5" />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{setup.step === 1 ? "你想练习什么岗位？" : "调整本次练习"}</CardTitle>
          <CardDescription>
            {setup.step === 1
              ? "选择预设 Skill 可以获得更稳定的知识点覆盖，也可以输入自定义岗位。"
              : "题数和难度会直接影响练习时间；高级选项保持可选。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={setup.submit} className="space-y-6">
            {setup.step === 1 ? (
              <>
                <SkillSelector
                  skills={setup.skills}
                  selectedSkillId={setup.draft.selectedSkillId}
                  useCustom={setup.draft.useCustom}
                  onSelectSkill={setup.selectSkill}
                  onSelectCustom={setup.selectCustom}
                />

                {(setup.draft.useCustom || !setup.draft.selectedSkillId) && (
                  <div className="space-y-2">
                    <Label htmlFor={`${mode}-position`}>面试岗位 *</Label>
                    <Input
                      id={`${mode}-position`}
                      autoFocus={setup.draft.useCustom}
                      className="min-h-11 text-base"
                      placeholder="例如：前端工程师 / 数据分析师 / 产品经理"
                      value={setup.draft.position}
                      maxLength={100}
                      onChange={(event) => setup.patchDraft({ position: event.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      使用招聘岗位中的常见名称，出题方向会更准确。
                    </p>
                  </div>
                )}

                <SkillTags skill={setup.selectedSkill} />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/35 p-4">
                  <div>
                    <div className="text-xs text-muted-foreground">面试方向</div>
                    <div className="mt-1 font-medium">{setup.draft.position}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setup.setStep(1)}
                  >
                    修改方向
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${mode}-difficulty`}>难度</Label>
                    <Select
                      value={setup.draft.difficulty}
                      onValueChange={(value) =>
                        setup.patchDraft({ difficulty: value as typeof setup.draft.difficulty })
                      }
                    >
                      <SelectTrigger id={`${mode}-difficulty`} className="min-h-11">
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
                    <Label htmlFor={`${mode}-count`}>题目数量</Label>
                    <Select
                      value={String(setup.draft.count)}
                      onValueChange={(value) => setup.patchDraft({ count: Number(value) })}
                    >
                      <SelectTrigger id={`${mode}-count`} className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_COUNTS.map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count} 题
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${mode}-profile`}>题型侧重</Label>
                  <Select
                    value={setup.draft.typeProfile}
                    onValueChange={(value) => setup.patchDraft({ typeProfile: value })}
                  >
                    <SelectTrigger id={`${mode}-profile`} className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">默认：AI 自主分配</SelectItem>
                      <SelectItem value="tech">技术侧重</SelectItem>
                      <SelectItem value="behavior">行为侧重</SelectItem>
                      <SelectItem value="scenario">场景侧重</SelectItem>
                      <SelectItem value="balanced">综合均衡</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {setup.draft.resumeId ? (
                  <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/5 p-4">
                    <FileText className="size-5 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{setup.draft.resumeName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        已从简历库关联，AI 会参考其中的经历。
                      </div>
                    </div>
                    <Badge variant="outline">已关联</Badge>
                  </div>
                ) : (
                  <ResumeUpload
                    resumeName={setup.draft.resumeName}
                    resumeText={setup.draft.resumeText}
                    onResumeNameChange={(resumeName) =>
                      setup.patchDraft({ resumeName, resumeId: undefined })
                    }
                    onResumeTextChange={(resumeText) =>
                      setup.patchDraft({ resumeText, resumeId: undefined })
                    }
                    onClear={() =>
                      setup.patchDraft({ resumeId: undefined, resumeName: "", resumeText: "" })
                    }
                  />
                )}

                <Collapsible>
                  <div className="rounded-xl border">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="group min-h-12 w-full justify-between rounded-xl px-4"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Settings2 />
                          高级设置
                        </span>
                        <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-5 border-t p-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${mode}-company`}>
                          目标公司 <span className="text-xs text-muted-foreground">（选填）</span>
                        </Label>
                        <Input
                          id={`${mode}-company`}
                          className="min-h-11 text-base"
                          placeholder="例如：字节跳动 / 腾讯 / Google"
                          value={setup.draft.targetCompany}
                          maxLength={100}
                          onChange={(event) =>
                            setup.patchDraft({ targetCompany: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${mode}-job-description`}>
                          岗位需求描述{" "}
                          <span className="text-xs text-muted-foreground">（选填）</span>
                        </Label>
                        <Textarea
                          id={`${mode}-job-description`}
                          className="min-h-28 text-base"
                          placeholder="岗位职责、技术栈、经验年限和团队协作要求等"
                          value={setup.draft.jobDescription}
                          maxLength={2000}
                          onChange={(event) =>
                            setup.patchDraft({ jobDescription: event.target.value })
                          }
                        />
                      </div>
                      <ModelSelector
                        value={setup.draft.modelProvider}
                        onChange={(modelProvider) => setup.patchDraft({ modelProvider })}
                      />
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between">
              {setup.step === 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setup.setStep(1)}
                >
                  返回上一步
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={setup.loading} className="min-h-11 sm:min-w-40">
                {setup.loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    AI 正在准备
                  </>
                ) : setup.step === 1 ? (
                  "下一步"
                ) : (
                  `创建${isVoice ? "语音" : "文本"}面试`
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
