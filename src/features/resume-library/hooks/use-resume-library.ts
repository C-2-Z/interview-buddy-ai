/** resume-library - 简历库列表 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteResume, listResumes, uploadResume } from "../api";
import type { ResumeListItem } from "../types";

export function useResumeLibrary() {
  const [items, setItems] = useState<ResumeListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listResumes());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载简历库失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.fileName, ...(item.analysis?.skills ?? [])].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    );
  }, [items, query]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const result = await uploadResume(file);
      toast.success(result.isDuplicate ? "该简历已存在，已打开原记录" : "简历上传并分析完成");
      await refresh();
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "上传简历失败";
      toast.error(message);
      throw cause;
    } finally {
      setUploading(false);
    }
  }

  async function remove(resumeId: string) {
    setDeletingId(resumeId);
    try {
      await deleteResume(resumeId);
      setItems((current) => current.filter((item) => item.id !== resumeId));
      toast.success("简历已删除");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "删除简历失败");
    } finally {
      setDeletingId(null);
    }
  }

  return {
    items,
    filteredItems,
    query,
    setQuery,
    loading,
    uploading,
    deletingId,
    error,
    refresh,
    upload,
    remove,
  };
}
