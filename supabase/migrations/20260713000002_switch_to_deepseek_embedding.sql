-- 切换到 DeepSeek Embedding（deepseek-embedding 模型，1024 维）

ALTER TABLE public.knowledge_chunks 
  ALTER COLUMN embedding TYPE vector(1024);

-- 删除旧的 IVFFlat 索引并重建
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON public.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
