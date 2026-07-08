import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/new")({
  component: NewInterview,
});

function NewInterview() {
  const navigate = useNavigate();
  const [position, setPosition] = useState("");
  const [difficulty, setDifficulty] = useState<"初级" | "中级" | "高级">("中级");
  const [jobDescription, setJobDescription] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [typeProfile, setTypeProfile] = useState("default");
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [count, setCount] = useState(5);
  const [modelProvider, setModelProvider] = useState<"deepseek" | "openai" | "anthropic">("deepseek");
  const [loading, setLoading] = useState(false);

  function getTypeConfig(profile: string): Record<string, number> {
    switch (profile) {
      case "tech": return { "技术题": 60, "行为题": 15, "场景题": 15, "系统设计": 10 };
      case "behavior": return { "技术题": 20, "行为题": 50, "场景题": 20, "系统设计": 10 };
      case "scenario": return { "技术题": 20, "行为题": 15, "场景题": 50, "系统设计": 15 };
      case "balanced": return { "技术题": 35, "行为题": 25, "场景题": 25, "系统设计": 15 };
      default: return {};
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!position.trim()) {
      toast.error("请填写面试岗位");
      return;
    }
    setLoading(true);
    try {
      const { sessionId } = await apiClient.createInterviewSession({
        position,
        difficulty,
        jobDescription,
        targetCompany,
        resumeText,
        questionTypeConfig: typeProfile === "default" ? undefined : getTypeConfig(typeProfile),
        questionCount: count,
        modelProvider,
      });
      toast.success("题目已生成");
      navigate({ to: "/session/$id", params: { id: sessionId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>配置面试</CardTitle>
        <CardDescription>告诉 AI 你想练习的方向，它会为你量身定制题目。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="position">面试岗位 *</Label>
            <Input
              id="position"
              placeholder="例如：前端工程师 / 数据分析师 / 产品经理"
              value={position}
              maxLength={100}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>难度</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="初级">初级</SelectItem>
                  <SelectItem value="中级">中级</SelectItem>
                  <SelectItem value="高级">高级</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>题目数量</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} 题</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>AI 模型</Label>
            <Select value={modelProvider} onValueChange={(v) => setModelProvider(v as typeof modelProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">DeepSeek Chat</SelectItem>
                <SelectItem value="openai">GPT-4o</SelectItem>
                <SelectItem value="anthropic">Claude 3 Sonnet</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              需要先在服务器环境变量中配置对应 API Key
            </p>
          </div>

          <div className="space-y-2">
            <Label>题型配比 <span className="text-muted-foreground text-xs">(选填)</span></Label>
            <Select value={typeProfile} onValueChange={setTypeProfile}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Label>热门公司 <span className="text-muted-foreground text-xs">(选填)</span></Label>
            <Input
              placeholder="例如：字节跳动 / 腾讯 / 阿里巴巴 / Google"
              value={targetCompany}
              maxLength={100}
              onChange={(e) => setTargetCompany(e.target.value)}
            />
          </div>


          <div className="space-y-2">
            <Label>简历上传 <span className="text-muted-foreground text-xs">(选填)</span></Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".txt,.md";
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  setResumeName(file.name);
                  const text = await file.text();
                  setResumeText(text.slice(0, 2000));
                };
                input.click();
              }}>
                {resumeName ? "重新上传" : "选择文件"}
              </Button>
              {resumeName && (
                <>
                  <span className="text-xs text-muted-foreground">{resumeName} ({resumeText.length}字)</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setResumeText(""); setResumeName(""); }}>清除</Button>
                </>
              )}
            </div>
            {resumeText && (
              <p className="text-xs text-muted-foreground mt-1">简历内容已读取，AI 将根据你的项目经历出题</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-description">岗位需求描述 <span className="text-muted-foreground text-xs">(选填)</span></Label>
            <Textarea
              id="job-description"
              placeholder="例如：岗位要求 3 年以上前端经验，熟悉 React/TypeScript，有性能优化和复杂业务场景经验…"
              value={jobDescription}
              rows={5}
              maxLength={2000}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI 生成中…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />生成面试题</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
