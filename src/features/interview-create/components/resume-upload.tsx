/** interview-create - 简历上传组件 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { uploadResumeFile } from "../api";

type ResumeUploadProps = {
  resumeName: string;
  resumeText: string;
  onResumeNameChange: (value: string) => void;
  onResumeTextChange: (value: string) => void;
  onClear: () => void;
};

/**
 * 恢复 上传
 * @returns
 */
export function ResumeUpload({
  resumeName,
  resumeText,
  onResumeNameChange,
  onResumeTextChange,
  onClear,
}: ResumeUploadProps) {
  const [parsing, setParsing] = useState(false);

  /**
   * choose file
   * @returns
   */
  function chooseFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,.txt,.md";
    input.onchange = async (event) => {
      /**
       * file
       *
       * @param event.target as HTMLInputElement -
       * @returns
       */
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      onResumeNameChange(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let text = "";
      if (ext === "txt" || ext === "md") {
        text = await file.text();
      } else if (ext === "pdf" || ext === "docx") {
        setParsing(true);
        try {
          const result = await uploadResumeFile(file);
          text = result.parsedText;
        } catch {
          toast.error("简历解析失败，请使用 TXT/MD 格式");
        } finally {
          setParsing(false);
        }
      }
      onResumeTextChange(text.slice(0, 2000));
    };
    input.click();
  }

  return (
    <div className="space-y-2">
      <Label>
        简历上传 <span className="text-muted-foreground text-xs">(选填)</span>
      </Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={chooseFile} disabled={parsing}>
          {parsing ? "解析中\u2026" : resumeName ? "重新上传" : "选择文件"}
        </Button>
        {parsing && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            正在解析文档\u2026
          </span>
        )}
        {!parsing && resumeName && (
          <>
            <span className="text-xs text-muted-foreground">
              {resumeName} ({resumeText.length}字)
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              清除
            </Button>
          </>
        )}
      </div>
      {resumeText && !parsing && (
        <p className="text-xs text-muted-foreground mt-1">
          简历内容已读取，AI 将根据你的项目经历出题
        </p>
      )}
    </div>
  );
}
