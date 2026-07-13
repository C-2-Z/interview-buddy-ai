-- 启用 pgvector 扩展（用于向量相似度搜索）
CREATE EXTENSION IF NOT EXISTS vector;

-- Phase 4 / A1-A4: RAG 知识库 — 文档表、chunk 表、图边表、QA 会话表

-- ============================================================
-- 1. 知识库文档表：用户上传的原始文档元数据
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT NOT NULL,
  file_size INT,
  file_hash TEXT,
  source TEXT DEFAULT 'upload',
  doc_metadata JSONB DEFAULT '{}',
  chunk_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_hash)
);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own knowledge documents" ON public.knowledge_documents
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT ALL ON public.knowledge_documents TO service_role;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_user
  ON public.knowledge_documents(user_id, created_at DESC);

-- ============================================================
-- 2. 文本分块表：每个 chunk + 向量（text-embedding-3-small, 1536 维）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own knowledge chunks" ON public.knowledge_chunks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON public.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user
  ON public.knowledge_chunks(user_id, document_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document
  ON public.knowledge_chunks(document_id, chunk_index);

-- ============================================================
-- 3. 知识图谱边：chunk 之间的语义相似关系（反链）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_chunk_id UUID NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  target_chunk_id UUID NOT NULL REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  similarity FLOAT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_chunk_id, target_chunk_id)
);

ALTER TABLE public.knowledge_graph_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own graph edges" ON public.knowledge_graph_edges
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_graph_edges TO authenticated;
GRANT ALL ON public.knowledge_graph_edges TO service_role;

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON public.knowledge_graph_edges(source_chunk_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON public.knowledge_graph_edges(target_chunk_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_user ON public.knowledge_graph_edges(user_id, similarity DESC);

-- ============================================================
-- 4. QA 问答会话
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '新问答',
  document_ids UUID[] NOT NULL DEFAULT '{}',
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own qa sessions" ON public.qa_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_sessions TO authenticated;
GRANT ALL ON public.qa_sessions TO service_role;

CREATE INDEX IF NOT EXISTS idx_qa_sessions_user ON public.qa_sessions(user_id, updated_at DESC);

-- ============================================================
-- 5. QA 会话中的消息
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.qa_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  cited_chunks JSONB DEFAULT '[]',
  token_usage JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own qa messages" ON public.qa_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.qa_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.qa_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_messages TO authenticated;
GRANT ALL ON public.qa_messages TO service_role;

CREATE INDEX IF NOT EXISTS idx_qa_messages_session ON public.qa_messages(session_id, created_at);

