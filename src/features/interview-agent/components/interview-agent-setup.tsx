/** Agent setup page with mode selection and web research toggle. */
import { useState } from "react";
import { ChevronDown, Globe, Keyboard, Loader2, Mic2, Settings2, Users } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ModelSelector } from "@/features/interview-create/components/model-selector";
import { SkillSelector } from "@/features/interview-create/components/skill-selector";
import { SkillTags } from "@/features/interview-create/components/skill-tags";
import { ResumeUpload } from "@/features/interview-create/components/resume-upload";
import { QUESTION_COUNTS } from "@/features/interview-create/constants";
import { useAgentSession } from "../hooks/use-agent-session";
import type { AgentMode } from "../types";
import { AGENT_ROLE_DISPLAY } from "../types";

type AgentSetupDraft = {
  mode: AgentMode;
  position: string;
  difficulty: string;
  count: number;
  targetCompany: string;
  jobDescription: string;
  webResearch: boolean;
  modelProvider: string;
  selectedSkillId: string | null;
  resumeId: string | undefined;
  resumeName: string;
  resumeText: string;
  interviewMode: "text" | "voice";
};

const DEFAULT_DRAFT: AgentSetupDraft = {
  mode: "single",
  position: "",
  difficulty: "??",
  count: 5,
  targetCompany: "",
  jobDescription: "",
  webResearch: true,
  modelProvider: "deepseek",
  selectedSkillId: null,
  resumeId: undefined,
  resumeName: "",
  resumeText: "",
  interviewMode: "text",
};

export function InterviewAgentSetupPage() {
  const router = useRouter();
  const { create, loading, error } = useAgentSession();
  const [draft, setDraft] = useState<AgentSetupDraft>(DEFAULT_DRAFT);
  const [step, setStep] = useState<1 | 2>(1);

  const patchDraft = (patch: Partial<AgentSetupDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    const sessionId = await create({
      mode: draft.mode,
      interviewMode: draft.interviewMode,
      position: draft.position,
      difficulty: draft.difficulty,
      questionCount: draft.count,
      targetCompany: draft.targetCompany || undefined,
      jobDescription: draft.jobDescription || undefined,
      skillId: draft.selectedSkillId || undefined,
      resumeId: draft.resumeId,
      modelProvider: draft.modelProvider,
      webResearch: draft.webResearch,
    });
    if (sessionId) {
      router.navigate({ to: "/agent/" + sessionId });
    }
  };

  const isVoice = draft.interviewMode === "voice";
  const ModeIcon = isVoice ? Mic2 : Keyboard;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ModeIcon className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Agent ????</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            AI ??? LangGraph ??????????????????
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>{step === 1 ? "??????" : "??????"}</CardTitle>
          <CardDescription>
            {step === 1
              ? "??????? AI ?????????????????HR ???????"
              : "????????????????"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-6">
            {step === 1 ? (
              <>
                <div className="space-y-3">
                  <Label>????</Label>
                  <ToggleGroup
                    type="single"
                    value={draft.mode}
                    onValueChange={(value) => { if (value) patchDraft({ mode: value as AgentMode }); }}
                    className="grid grid-cols-2 gap-3"
                  >
                    <ToggleGroupItem value="single" className="flex-col gap-2 p-6 data-[state=on]:border-primary">
                      <Users className="size-8" />
                      <div className="space-y-1 text-center">
                        <div className="font-semibold">????</div>
                        <div className="text-xs text-muted-foreground">?? AI ????????</div>
                      </div>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="panel" className="flex-col gap-2 p-6 data-[state=on]:border-primary">
                      <Users className="size-8" />
                      <div className="space-y-1 text-center">
                        <div className="font-semibold">?????</div>
                        <div className="text-xs text-muted-foreground">?? ?? HR ??????</div>
                      </div>
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {draft.mode === "panel" && (
                  <div className="flex flex-wrap gap-2">
                    {(["technical", "manager", "hr"] as const).map((roleId) => (
                      <Badge key={roleId} className={AGENT_ROLE_DISPLAY[roleId].color + " text-white"}>
                        {AGENT_ROLE_DISPLAY[roleId].label}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="agent-position">???? *</Label>
                  <Input id="agent-position" className="min-h-11 text-base"
                    placeholder="???????? / ????? / ????"
                    value={draft.position} maxLength={100}
                    onChange={(e) => patchDraft({ position: e.target.value })} />
                </div>

                <div className="flex items-center gap-4 rounded-xl border p-4">
                  <div className="flex items-center gap-2"><Keyboard className="size-4" /><span className="text-sm">??</span></div>
                  <Switch checked={draft.interviewMode === "voice"}
                    onCheckedChange={(checked) => patchDraft({ interviewMode: checked ? "voice" : "text" })} />
                  <div className="flex items-center gap-2"><Mic2 className="size-4" /><span className="text-sm">??</span></div>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-difficulty">??</Label>
                    <Select value={draft.difficulty} onValueChange={(v) => patchDraft({ difficulty: v })}>
                      <SelectTrigger id="agent-difficulty" className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="??">??</SelectItem>
                        <SelectItem value="??">??</SelectItem>
                        <SelectItem value="??">??</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-count">????</Label>
                    <Select value={String(draft.count)} onValueChange={(v) => patchDraft({ count: Number(v) })}>
                      <SelectTrigger id="agent-count" className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUESTION_COUNTS.map((c) => (<SelectItem key={c} value={String(c)}>{c} ?</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div className="flex items-center gap-3">
                    <Globe className="size-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">????</div>
                      <div className="text-xs text-muted-foreground">?????????????????????</div>
                    </div>
                  </div>
                  <Switch checked={draft.webResearch} onCheckedChange={(c) => patchDraft({ webResearch: c })} />
                </div>

                <ResumeUpload
                  resumeName={draft.resumeName} resumeText={draft.resumeText}
                  onResumeNameChange={(n) => patchDraft({ resumeName: n, resumeId: undefined })}
                  onResumeTextChange={(t) => patchDraft({ resumeText: t, resumeId: undefined })}
                  onClear={() => patchDraft({ resumeId: undefined, resumeName: "", resumeText: "" })}
                />

                <Collapsible>
                  <div className="rounded-xl border">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost"
                        className="group min-h-12 w-full justify-between rounded-xl px-4">
                        <span className="inline-flex items-center gap-2"><Settings2 />????</span>
                        <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-5 border-t p-4">
                      <div className="space-y-2">
                        <Label htmlFor="agent-company">???? <span className="text-xs text-muted-foreground">????</span></Label>
                        <Input id="agent-company" className="min-h-11 text-base"
                          placeholder="??????? / ?? / Google"
                          value={draft.targetCompany} maxLength={100}
                          onChange={(e) => patchDraft({ targetCompany: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="agent-jd">?????? <span className="text-xs text-muted-foreground">????</span></Label>
                        <Textarea id="agent-jd" className="min-h-28 text-base"
                          placeholder="?????????????????????"
                          value={draft.jobDescription} maxLength={2000}
                          onChange={(e) => patchDraft({ jobDescription: e.target.value })} />
                      </div>
                      <ModelSelector value={draft.modelProvider} onChange={(m) => patchDraft({ modelProvider: m })} />
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between">
              {step === 2 ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setStep(1)}>?????</Button>
              ) : <span />}
              <Button type="submit" disabled={loading || !draft.position.trim()} className="min-h-11 sm:min-w-40">
                {loading ? <><Loader2 className="animate-spin" />AI ????</>
                  : step === 1 ? "???" : "????"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
