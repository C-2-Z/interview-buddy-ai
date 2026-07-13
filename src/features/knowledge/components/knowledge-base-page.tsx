/** 知识库主页面：Tab 容器 — 文档管理 / 知识问答 / 知识图谱 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KnowledgeNavigation } from "./knowledge-navigation";
import { BrainSelector } from "./brain-selector";
import { DocumentListPanel } from "./document-list";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { QaSidebar } from "./qa-sidebar";
import { QaChatPanel } from "./qa-chat-panel";
import { QaDocumentSelector } from "./qa-document-selector";
import { KnowledgeSearchBar } from "./knowledge-search-bar";
import { GraphExplorer } from "./graph-explorer";
import { useKnowledgeList } from "../hooks/use-knowledge-list";
import { useKnowledgeDelete } from "../hooks/use-knowledge-delete";
import { useKnowledgeUpload } from "../hooks/use-knowledge-upload";
import {
  useQaSessions,
  useCreateQaSession,
} from "../hooks/use-qa-sessions";
import { useQaSession } from "../hooks/use-qa-session";
import { useQaAsk } from "../hooks/use-qa-ask";
import { useDeleteQaSession } from "../hooks/use-qa-session";
import { useDefaultBrain, useBrainDetail, useAddDocumentsToBrain } from "../hooks/use-brains";
import type { KnowledgeTab, KnowledgeDocument, QaSession, Brain } from "../types";

/** 知识库主页面组件 */
export function KnowledgeBasePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/knowledge" }) as { tab?: KnowledgeTab };
  const activeTab: KnowledgeTab = (search.tab as KnowledgeTab) ?? "documents";

  // 知识库
  const { data: defaultBrainData } = useDefaultBrain();
  const addDocToBrain = useAddDocumentsToBrain();
  const [activeBrainId, setActiveBrainId] = useState<string>("");
  const { data: brainDetail } = useBrainDetail(activeBrainId);
  const brainDocIds = brainDetail?.documentIds ?? [];

  // 初始化：从默认知识库加载
  useEffect(() => {
    if (defaultBrainData?.brain && !activeBrainId) {
      setActiveBrainId(defaultBrainData.brain.id);
    }
  }, [defaultBrainData, activeBrainId]);

  /** 切换知识库 */
  function handleBrainChange(brain: Brain) {
    setActiveBrainId(brain.id);
  }

  // 文档
  const { data: docsData, isLoading: docsLoading } = useKnowledgeList();
  const deleteDocMutation = useKnowledgeDelete();
  const uploadDocMutation = useKnowledgeUpload();
  const documents = docsData?.documents ?? [];
  const filteredDocs = activeBrainId ? documents.filter((d) => brainDocIds.includes(d.id)) : documents;

  // QA
  const { data: qaSessionsData, isLoading: qaSessionsLoading } = useQaSessions();
  const createQaSessionMutation = useCreateQaSession();
  const deleteQaSessionMutation = useDeleteQaSession();
  const { ask: askStream, streamingAnswer, isStreaming } = useQaAsk();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { data: activeSessionData, isLoading: activeSessionLoading } = useQaSession(activeSessionId);
  const qaSessions = qaSessionsData?.sessions ?? [];

  /** Tab 切换 */
  function handleTabChange(tab: KnowledgeTab) {
    navigate({ search: { tab } as any });
    if (tab !== "qa") setActiveSessionId(null);
  }

  /** 上传文档 */
  async function handleUpload(params: { title: string; content: string; fileName?: string; fileType: "pdf" | "docx" | "txt" | "md"; fileSize?: number }) {
    const result = await uploadDocMutation.mutateAsync(params);
    if (result?.id && activeBrainId) {
      try {
        await addDocToBrain.mutateAsync({ brainId: activeBrainId, documentIds: [result.id] });
      } catch {
        // 后端会自动关联到默认知识库，前端不阻塞
      }
    }
  }

  /** 删除文档 */
  function handleDelete(id: string) {
    deleteDocMutation.mutate(id);
    toast.success("文档已删除");
  }

  /** 创建问答会话 */
  async function handleCreateSession(documentIds?: string[]) {
    try {
      const result = await createQaSessionMutation.mutateAsync({ documentIds });
      setActiveSessionId(result.session.id);
    } catch (err) {
      toast.error("创建问答会话失败");
    }
  }

  /** 提问 */
  function handleAsk(question: string) {
    if (!activeSessionId) return;
    askStream(activeSessionId, question);
  }

  return (
    <div className="flex h-full flex-col">
      {/* 知识库选择器 */}
      <BrainSelector
        activeBrainId={activeBrainId}
        onBrainChange={handleBrainChange}
      />

      {/* Tab 导航 */}
      <KnowledgeNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      {/* 文档管理 Tab */}
      {activeTab === "documents" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">文档管理</h2>
            <div className="flex items-center gap-3">
              <div className="w-64">
                <KnowledgeSearchBar documentIds={brainDocIds} />
              </div>
              <DocumentUploadDialog onUpload={handleUpload}>
                <Button>
                  <Plus className="mr-1.5 size-4" />
                  上传文档
                </Button>
              </DocumentUploadDialog>
            </div>
          </div>
          <DocumentListPanel
            documents={filteredDocs}
            isLoading={docsLoading}
            onDelete={handleDelete}
            onUploadClick={() => {}}
          />
        </div>
      )}

      {/* 知识问答 Tab */}
      {activeTab === "qa" && (
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧会话列表 */}
          <div className="w-64 shrink-0">
            <QaSidebar
              sessions={qaSessions}
              isLoading={qaSessionsLoading}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onNewSession={() => setActiveSessionId(null)}
               onDeleteSession={(id) => deleteQaSessionMutation.mutate(id)}
            />
          </div>

          {/* 右侧聊天区域 */}
          <div className="flex-1">
            {activeSessionId ? (
              <QaChatPanel
                messages={activeSessionData?.messages}
                isLoading={activeSessionLoading}
                isAsking={isStreaming}
                documentIds={activeSessionData?.session?.documentIds ?? []}
                documents={documents}
                onSubmit={handleAsk}
                streamingAnswer={streamingAnswer}
              />
            ) : (
              <QaDocumentSelector
                documents={filteredDocs}
                onStartSession={(ids) => handleCreateSession(ids)}
              />
            )}
          </div>
        </div>
      )}

      {/* 知识图谱 Tab */}
      {activeTab === "graph" && (
        <div className="flex-1">
          <GraphExplorer />
        </div>
      )}
    </div>
  );
}
