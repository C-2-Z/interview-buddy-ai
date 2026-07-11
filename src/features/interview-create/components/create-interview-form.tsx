/** interview-create - 创建面试表单组件 */
import { Loader2, Sparkles } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { QUESTION_COUNTS } from "../constants";
import { useCreateInterview } from "../hooks/use-create-interview";
import { ModelSelector } from "./model-selector";
import { ResumeUpload } from "./resume-upload";
import { SkillSelector } from "./skill-selector";
import { SkillTags } from "./skill-tags";

/**
 * 创建 interview form
 * @returns 
 */
export function CreateInterviewForm() {
  const form = useCreateInterview();
  const showPosition = form.useCustom || !form.selectedSkillId;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>配置文本面试</CardTitle>
          <CardDescription>
            选择一个面试方向，或自定义输入岗位，AI 将为文本面试生成题目。
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
                <Label htmlFor="position">面试岗位 *</Label>
                <Input
                  id="position"
                  placeholder="例如：前端工程师 / 数据分析师 / 产品经理"
                  value={form.position}
                  maxLength={100}
                  onChange={(e) => form.setPosition(e.target.value)}
                />
              </div>
            )}

            <SkillTags skill={form.selectedSkill} />

            <ModelSelector value={form.modelProvider} onChange={form.setModelProvider} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>难度</Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => form.setDifficulty(v as typeof form.difficulty)}
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
                <Select value={String(form.count)} onValueChange={(v) => form.setCount(Number(v))}>
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
                题型配比 <span className="text-muted-foreground text-xs">(选填)</span>
              </Label>
              <Select value={form.typeProfile} onValueChange={form.setTypeProfile}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认（AI 自主分配）</SelectItem>
                  <SelectItem value="tech">技术侧重</SelectItem>
                  <SelectItem value="behavior">行为侧重</SelectItem>
                  <SelectItem value="scenario">场景侧重</SelectItem>
                  <SelectItem value="balanced">综合均衡</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                热门公司 <span className="text-muted-foreground text-xs">(选填)</span>
              </Label>
              <Input
                placeholder="例如：字节跳动 / 腾讯 / 阿里巴巴 / Google"
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
              <Label htmlFor="jobDescription">
                岗位需求描述 <span className="text-muted-foreground text-xs">(选填)</span>
              </Label>
              <Textarea
                id="jobDescription"
                placeholder="例如：岗位职责、技术栈、经验年限、业务场景、团队协作要求等"
                value={form.jobDescription}
                rows={5}
                maxLength={2000}
                onChange={(e) => form.setJobDescription(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={form.loading} className="w-full">
              {form.loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI 生成中…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  生成文本面试题
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
