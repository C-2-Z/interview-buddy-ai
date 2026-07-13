-- Phase 2: 知识库（Brain）概念 — 知识库表 + 知识库-文档多对多关联表

-- ============================================================
-- 1. 知识库表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_brains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT DEFAULT NULL,
  embedding_provider TEXT DEFAULT 'dashscope',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_brains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own brains" ON public.knowledge_brains
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_brains TO authenticated;
GRANT ALL ON public.knowledge_brains TO service_role;

CREATE INDEX IF NOT EXISTS idx_knowledge_brains_user_id
  ON public.knowledge_brains(user_id, created_at DESC);

-- ============================================================
-- 2. 知识库-文档多对多关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_brain_documents (
  brain_id UUID NOT NULL REFERENCES public.knowledge_brains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brain_id, document_id)
);

ALTER TABLE public.knowledge_brain_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own brain documents" ON public.knowledge_brain_documents
  FOR ALL TO authenticated
  USING (
    brain_id IN (
      SELECT id FROM public.knowledge_brains WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    brain_id IN (
      SELECT id FROM public.knowledge_brains WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_brain_documents TO authenticated;
GRANT ALL ON public.knowledge_brain_documents TO service_role;

CREATE INDEX IF NOT EXISTS idx_brain_documents_brain_id
  ON public.knowledge_brain_documents(brain_id);
CREATE INDEX IF NOT EXISTS idx_brain_documents_document_id
  ON public.knowledge_brain_documents(document_id);

-- ============================================================
-- 3. 为已有用户自动创建默认知识库，并将所有文档关联上去
-- ============================================================
INSERT INTO public.knowledge_brains (id, user_id, name, description)
SELECT gen_random_uuid(), user_id, '默认知识库', '自动创建的默认知识库'
FROM (
  SELECT DISTINCT user_id FROM public.knowledge_documents
  WHERE user_id NOT IN (SELECT user_id FROM public.knowledge_brains)
) AS users_without_brain;

INSERT INTO public.knowledge_brain_documents (brain_id, document_id)
SELECT b.id, d.id
FROM public.knowledge_documents d
JOIN public.knowledge_brains b ON b.user_id = d.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_brain_documents bd
  WHERE bd.document_id = d.id
);
