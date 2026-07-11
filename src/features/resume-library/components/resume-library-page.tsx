/** resume-library - 简历库主页面 */
import { Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, FileText, Search, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useResumeLibrary } from "../hooks/use-resume-library";

/**
 * 格式化 file size
 *
 * @param size -
 * @returns
 */
function formatFileSize(size: number | null): string {
  if (!size) return "未知大小";
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 恢复 library page
 * @returns
 */
export function ResumeLibraryPage() {
  const library = useResumeLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  /**
   * 处理 file
   *
   * @param file -
   * @returns Promise<
   */
  async function handleFile(file?: File) {
    if (!file) return;
    const result = await library.upload(file).catch(() => null);
    if (result) await navigate({ to: "/resumes/$id", params: { id: result.id } });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">简历管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            集中管理简历，让 AI 根据你的真实经历准备面试追问。
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button
          className="min-h-11"
          disabled={library.uploading}
          onClick={() => inputRef.current?.click()}
        >
          {library.uploading ? (
            <>
              <Sparkles className="animate-pulse" />
              AI 正在分析
            </>
          ) : (
            <>
              <UploadCloud />
              上传简历
            </>
          )}
        </Button>
      </header>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          className="min-h-11 pl-9 text-base"
          placeholder="按文件名或技能搜索"
          aria-label="搜索简历"
          value={library.query}
          onChange={(event) => library.setQuery(event.target.value)}
        />
      </div>

      {library.loading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-label="正在加载简历">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : library.error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{library.error}</p>
            <Button variant="outline" className="min-h-11" onClick={() => void library.refresh()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : library.items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
              <FilePlus2 className="size-7" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">上传第一份简历</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              支持 PDF、DOCX、TXT 和 Markdown，单个文件不超过 10MB。
            </p>
            <Button className="mt-6 min-h-11" onClick={() => inputRef.current?.click()}>
              <UploadCloud />
              选择文件
            </Button>
          </CardContent>
        </Card>
      ) : library.filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            没有匹配“{library.query}”的简历。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {library.filteredItems.map((resume) => (
            <Card key={resume.id} className="flex flex-col border-border/80">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base" title={resume.fileName}>
                      {resume.fileName}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatFileSize(resume.fileSize)} ·{" "}
                      {new Date(resume.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div className="flex min-h-14 flex-wrap content-start gap-1.5">
                  {(resume.analysis?.skills ?? []).slice(0, 6).map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                  {!resume.analysis && <Badge variant="outline">暂无分析</Badge>}
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                  {resume.analysis?.overallAssessment ||
                    "打开详情查看简历原文，并以这份简历开始针对性面试。"}
                </p>
                <div className="mt-5 flex items-center gap-2 border-t pt-4">
                  <Button className="min-h-10 flex-1" asChild>
                    <Link to="/resumes/$id" params={{ id: resume.id }}>
                      查看详情
                    </Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-10 text-destructive"
                        aria-label={`删除 ${resume.fileName}`}
                      >
                        <Trash2 />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认删除这份简历？</AlertDialogTitle>
                        <AlertDialogDescription>
                          将删除“{resume.fileName}”及其分析结果，已创建的面试记录不会受影响。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => void library.remove(resume.id)}
                        >
                          {library.deletingId === resume.id ? "正在删除…" : "确认删除"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
