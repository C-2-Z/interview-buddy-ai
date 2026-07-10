import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  FileText,
  GraduationCap,
  Keyboard,
  Lightbulb,
  Mic2,
  RotateCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useResumeDetail } from "../hooks/use-resume-detail";

export function ResumeDetailPage({ resumeId }: { resumeId: string }) {
  const detail = useResumeDetail(resumeId);

  if (detail.loading) {
    return (
      <div className="space-y-4" aria-label="正在加载简历详情">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!detail.resume || detail.error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <FileText className="size-9 text-muted-foreground" />
          <div>
            <h1 className="font-semibold">无法打开简历</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.error || "该简历不存在或已被删除。"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void detail.refresh()}>
              <RotateCw />
              重试
            </Button>
            <Button asChild>
              <Link to="/resumes">返回简历库</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { resume } = detail;
  const analysis = resume.analysis;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" className="-ml-3 min-h-11" asChild>
            <Link to="/resumes">
              <ArrowLeft />
              返回简历库
            </Link>
          </Button>
          <h1
            className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl"
            title={resume.fileName}
          >
            {resume.fileName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            上传于 {new Date(resume.createdAt).toLocaleString("zh-CN")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" className="min-h-11" asChild>
            <Link to="/new" search={{ resumeId: resume.id }}>
              <Keyboard />
              创建文本简历面试
            </Link>
          </Button>
          <Button className="min-h-11" asChild>
            <Link to="/voice/new" search={{ resumeId: resume.id }}>
              <Mic2 />
              创建语音简历面试
            </Link>
          </Button>
        </div>
      </header>

      {analysis ? (
        <>
          <Card className="border-primary/20 bg-primary/[0.035]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="text-primary" />
                AI 综合评估
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="max-w-4xl whitespace-pre-wrap text-sm leading-7 text-foreground/85">
                {analysis.overallAssessment}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">技能概览</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {analysis.skills.length ? (
                  analysis.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="px-3 py-1">
                      {skill}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">暂未识别到明确技能。</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="size-4 text-primary" />
                  教育经历
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.education?.school ? (
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">{analysis.education.school}</div>
                    <div className="text-muted-foreground">
                      {[analysis.education.degree, analysis.education.major]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂未识别到教育经历。</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BriefcaseBusiness className="size-4 text-primary" />
                工作经历
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.workExperience.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {analysis.workExperience.map((experience, index) => (
                    <div
                      key={`${experience.company}-${index}`}
                      className="rounded-xl border bg-muted/25 p-4"
                    >
                      <div className="font-medium">{experience.company || "未注明公司"}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {experience.role}
                        {experience.years ? ` · ${experience.years}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂未识别到工作经历。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">项目经历</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.projects.length ? (
                <div className="space-y-3">
                  {analysis.projects.map((project, index) => (
                    <div key={`${project.name}-${index}`} className="rounded-xl border p-4">
                      <div className="font-medium">{project.name || "未命名项目"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {project.techStack.map((tech) => (
                          <Badge key={tech} variant="outline">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                      {project.description && (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {project.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂未识别到项目经历。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">建议重点准备的问题</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.suggestedQuestions.length ? (
                <ol className="space-y-3">
                  {analysis.suggestedQuestions.map((question, index) => (
                    <li key={`${question}-${index}`} className="flex gap-3 text-sm leading-6">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                        {index + 1}
                      </span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">暂无建议问题。</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-6 text-sm leading-6 text-muted-foreground">
            这份简历已成功解析，但 AI 分析暂不可用。你仍然可以使用简历原文创建面试。
          </CardContent>
        </Card>
      )}

      <details className="rounded-2xl border bg-card">
        <summary className="cursor-pointer px-5 py-4 font-medium">查看简历原文</summary>
        <div className="border-t px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-muted-foreground">
            {resume.parsedText}
          </pre>
        </div>
      </details>
    </div>
  );
}
