/** 知识库管理：上传文档对话框（拖拽区域 + 选择文件） */

import { useState, useRef, type ChangeEvent } from "react";
import { Upload, FileText, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** 上传对话框属性 */
interface DocumentUploadDialogProps {
  onUpload: (params: {
    title: string;
    content: string;
    fileName?: string;
    fileType: "pdf" | "docx" | "txt" | "md";
    fileSize?: number;
  }) => Promise<void>;
  children?: React.ReactNode;
}

/** 支持的文件 MIME 类型 */
const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md";

/** 上传文档对话框 */
export function DocumentUploadDialog({ onUpload, children }: DocumentUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 处理文件选择 */
  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }

  /** 处理拖放 */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && ACCEPTED_TYPES.includes(file.name.split(".").pop()?.toLowerCase() ?? "")) {
      setSelectedFile(file);
    } else {
      toast.error("不支持的文件格式");
    }
  }

  /** 读取文件内容并上传 */
  async function handleUpload() {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() as
        "pdf" | "docx" | "txt" | "md";
      const content = await readFileAsBase64(selectedFile);
      await onUpload({
        title: selectedFile.name.replace(/\.[^/.]+$/, ""),
        content,
        fileName: selectedFile.name,
        fileType: ext,
        fileSize: selectedFile.size,
      });
      toast.success("文档上传成功");
      setOpen(false);
      setSelectedFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children ?? <Button>上传文档</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传文档</DialogTitle>
          <DialogDescription>支持 PDF、Word、纯文本和 Markdown 格式（最大 10MB）</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 拖拽区域 */}
          <div
            className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {selectedFile ? (
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <FileText className="size-4" />
                  {selectedFile.name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                  >
                    <X className="size-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </span>
              ) : (
                <>
                  <span className="font-medium">点击选择文件</span> 或拖放文件到此处
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? "上传中..." : "开始上传"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 将 File 读取为 base64 字符串 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
