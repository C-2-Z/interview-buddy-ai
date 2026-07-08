import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type ResumeUploadProps = {
  resumeName: string;
  resumeText: string;
  onResumeNameChange: (value: string) => void;
  onResumeTextChange: (value: string) => void;
  onClear: () => void;
};

export function ResumeUpload({
  resumeName,
  resumeText,
  onResumeNameChange,
  onResumeTextChange,
  onClear,
}: ResumeUploadProps) {
  function chooseFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      onResumeNameChange(file.name);
      const text = await file.text();
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
        <Button type="button" variant="outline" size="sm" onClick={chooseFile}>
          {resumeName ? "重新上传" : "选择文件"}
        </Button>
        {resumeName && (
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
      {resumeText && (
        <p className="text-xs text-muted-foreground mt-1">
          简历内容已读取，AI 将根据你的项目经历出题
        </p>
      )}
    </div>
  );
}

