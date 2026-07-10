import { Loader2, Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_COUNTS } from "@/features/interview-create/constants";
import { ModelSelector } from "@/features/interview-create/components/model-selector";
import { ResumeUpload } from "@/features/interview-create/components/resume-upload";
import { SkillSelector } from "@/features/interview-create/components/skill-selector";
import { SkillTags } from "@/features/interview-create/components/skill-tags";
import { useCreateVoiceInterview } from "../hooks/use-create-voice-interview";

export function VoiceCreateForm() {
  const form = useCreateVoiceInterview();
  const showPosition = form.useCustom || !form.selectedSkillId;

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>配置语音面试</CardTitle>
          <CardDescription>
            AI 面试官会按真实面试方式逐题提问、追问并实时语音互动。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.submit} className="space-y-5">
            <SkillSelector
              skills={form.skills}
              selectedSkillId={form.selectedSkillId}
              useCustom={form.useCustom}
              onSelectSkill={form.selectSkill}
              onSelectCustom={form.selectCustom}
            />

            {showPosition && (
              <div className="space-y-2">
                <Label htmlFor="voice-position">面试岗位 *</Label>
                <Input
                  id="voice-position"
                  placeholder="例如：前端工程师 / 数据分析师 / 产品经理"
                  value={form.position}
                  maxLength={100}
                  onChange={(e) => form.setPosition(e.target.value)}
                />
              </div>
            )}

            <SkillTags skill={form.selectedSkill} />

            <ModelSelector
              value={form.modelProvider}
              onChange={form.setModelProvider}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>难度</Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(value) =>
                    form.setDifficulty(value as typeof form.difficulty)
                  }
                >
                  <SelectTrigger>
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
                <Label>题目数量</Label>
                <Select
                  value={String(form.count)}
                  onValueChange={(value) => form.setCount(Number(value))}
                >
                  <SelectTrigger>
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
              <Label>
                题型配比{" "}
                <span className="text-xs text-muted-foreground">(选填)</span>
              </Label>
              <Select
                value={form.typeProfile}
                onValueChange={form.setTypeProfile}
              >
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label>
                目标公司{" "}
                <span className="text-xs text-muted-foreground">(选填)</span>
              </Label>
              <Input
                placeholder="例如：字节跳动 / 腾讯 / Google"
                value={form.targetCompany}
                maxLength={100}
                onChange={(e) => form.setTargetCompany(e.target.value)}
              />
            </div>

            <ResumeUpload
              resumeName={form.resumeName}
              resumeText={form.resumeText}
              onResumeNameChange={form.setResumeName}
              onResumeTextChange={form.setResumeText}
              onClear={form.clearResume}
            />

            <div className="space-y-2">
              <Label htmlFor="voice-job-description">
                岗位需求描述{" "}
                <span className="text-xs text-muted-foreground">(选填)</span>
              </Label>
              <Textarea
                id="voice-job-description"
                placeholder="岗位职责、技术栈、经验年限、业务场景、团队协作要求等"
                value={form.jobDescription}
                rows={5}
                maxLength={2000}
                onChange={(e) => form.setJobDescription(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={form.loading} className="w-full">
              {form.loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI 正在准备语音面试
                </>
              ) : (
                <>
                  <Mic2 className="mr-2 h-4 w-4" />
                  创建语音面试
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
