-- Phase 2: 知识库（Brain）相关表
-- 在 Supabase SQL Editor 中执行此脚本
-- 
-- 注意：先在 Supabase Dashboard 中执行此脚本，然后重启 API 服务

-- 1. 创建知识库表
CREATE TABLE IF NOT EXISTS knowledge_brains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT DEFAULT NULL,
  embedding_provider TEXT DEFAULT 'dashscope',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建知识库-文档多对多关联表
CREATE TABLE IF NOT EXISTS knowledge_brain_documents (
  brain_id UUID NOT NULL REFERENCES knowledge_brains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (brain_id, document_id)
);

-- 3. 为已有用户自动创建默认知识库，并将所有文档关联上去
INSERT INTO knowledge_brains (id, user_id, name, description)
SELECT gen_random_uuid(), user_id, '默认知识库', '自动创建的默认知识库'
FROM (
  SELECT DISTINCT user_id FROM knowledge_documents
  WHERE user_id NOT IN (SELECT user_id FROM knowledge_brains)
) AS users_without_brain;

INSERT INTO knowledge_brain_documents (brain_id, document_id)
SELECT b.id, d.id
FROM knowledge_documents d
JOIN knowledge_brains b ON b.user_id = d.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_brain_documents bd
  WHERE bd.document_id = d.id
);

-- 4. 添加索引
CREATE INDEX IF NOT EXISTS idx_knowledge_brains_user_id ON knowledge_brains(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_brain_documents_brain_id ON knowledge_brain_documents(brain_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_brain_documents_document_id ON knowledge_brain_documents(document_id);
