# 知识库模块改进方案 & 执行记录

> 基于 Quivr-core 的设计思路，对 knowledge 模块进行系统性重构。
> 执行时间：2026-07-13

## 一、当前实现现状（改进前）

| 问题 | 描述 |
|------|------|
| RAG 流程过于朴素 | 只有 "embedding 检索 → 拼接 context → 调 AI" 三步，缺 rerank、query 改写、上下文压缩 |
| 文件解析不可扩展 | `parser.service.ts` 硬编码 4 种格式，加新格式得改代码 |
| 分块策略单一 | 自实现 `chunkText` 用字符近似估算 token，不支持配置切换 |
| QA Prompt 硬编码 | System prompt 写死在 `qa.service.ts` 里 |
| 知识图谱 O(n²) | 全量 chunk 两两 cosine 相似度计算，文档数多时性能堪忧 |
| 缺知识库概念 | 文档和 QA 会话之间没有"知识库"分组边界 |
| 前端功能单薄 | 缺搜索发现、文档选择器、Brain 管理器 |

## 二、Quivr 核心设计理念

| 理念 | 说明 |
|------|------|
| Brain 为一等公民 | Brain = 文档组 + 向量库 + LLM 配置 + RAG 工作流 |
| Processor Registry | 文件类型通过优先级注册表关联解析器，支持社区扩展 |
| 可配置 RAG Pipeline | 支持 reranker、query 改写、任务分解、工具调用 |
| Prompt 模板化 | RAG prompt 通过 `CustomPromptsDict` 暴露给用户 |
| 结构化答案 | 约束 AI 输出格式（引用编号 + followup questions） |

## 三、改进方案（四阶段）

### Phase 1 — 基础设施重构

| 模块 | 改动 | 文件 |
|------|------|------|
| Processor Registry | 用扩展表替换 switch-case | 5 新增 |
| Configurable Splitter | 三策略分块（recursive / sentence / sliding_window） | 6 新增 |
| RAG Prompts | Prompt 模板化，变量注入 `{context}` `{history}` `{date}` | 1 新增 |

**架构效果**：
- 加新文件格式只需写一个 `class extends ProcessorBase` + 一行 `processorRegistry.register()`
- 调用方只需 `splitText(content, "sentence")` 切换分块策略
- Prompt 模板支持 `renderTemplate()` 渲染，用户可自定义

### Phase 2 — Brain（知识库）概念引入

| 模块 | 改动 | 文件 |
|------|------|------|
| 数据库 migration | `knowledge_brains` + `knowledge_brain_documents` 表；已有用户自动创建默认知识库 | 1 |
| Brain 后端 | 完整 CRUD API + 文档关联；上传自动关联到默认 Brain | 5 |
| Brain 前端 | 页面顶部知识库选择器（切换/创建/删除） | 2 |

**关键设计**：
- Brain 必需 + 自动默认（首次上传自动创建"默认知识库"）
- 多对多关联（文档可属于多个 Brain，Brain 可有多个文档）
- 兼容已有数据（migration 为所有用户创建默认知识库）

### Phase 3 — RAG Pipeline 增强

| 模块 | 改动 | 文件 |
|------|------|------|
| Query Rewrite | 根据对话历史改写问题，消歧 | 1 |
| Context Compression | 按相似度排序 + Token 预算裁剪 | 1 |
| RAG 流程集成 | qa.service.ts 五步：改写 → 检索(10条) → 压缩 → 拼接 → LLM | 1 |

**流程变更**：
```
旧: 检索(5条) → 拼接 → LLM
新: 改写问题 → 检索(10条) → 压缩(相似度/预算) → 拼接 → LLM
```

### Phase 4 — 前端体验增强

| 模块 | 改动 | 文件 |
|------|------|------|
| 搜索发现 | `POST /api/knowledge/search` 端点 + 搜索条组件 | 4 |
| QA 文档选择器 | 创建会话前的文档选择面板（全选/取消/计数） | 1 |

## 四、文件变更总览

### 后端 (api-server)

| 路径 | 操作 | 说明 |
|------|------|------|
| `modules/knowledge/processor/processor-base.ts` | 新增 | ProcessorBase 抽象基类 |
| `modules/knowledge/processor/processor-registry.ts` | 新增 | 全局注册表，按文件类型索引 + 优先级排序 |
| `modules/knowledge/processor/index.ts` | 新增 | 模块入口，注册所有内置 Processor |
| `modules/knowledge/processor/implementations/text-processor.ts` | 新增 | .txt / .md 解析器 |
| `modules/knowledge/processor/implementations/pdf-processor.ts` | 新增 | .pdf 解析器（pdf-parse） |
| `modules/knowledge/processor/implementations/docx-processor.ts` | 新增 | .docx 解析器（mammoth） |
| `modules/knowledge/splitter/splitter-base.ts` | 新增 | SplitterBase + SplitterConfig |
| `modules/knowledge/splitter/splitter-registry.ts` | 新增 | 策略注册表 |
| `modules/knowledge/splitter/index.ts` | 新增 | 模块入口 + 便捷 splitText() |
| `modules/knowledge/splitter/strategies/recursive-char-splitter.ts` | 新增 | 递归字符分块（兼容旧逻辑） |
| `modules/knowledge/splitter/strategies/sentence-splitter.ts` | 新增 | 按句分块（中文文档） |
| `modules/knowledge/splitter/strategies/sliding-window-splitter.ts` | 新增 | 滑动窗口分块（技术文档） |
| `modules/knowledge/rag/prompts.ts` | 新增 | Prompt 模板系统 |
| `modules/knowledge/rag/query-rewriter.ts` | 新增 | 查询改写 |
| `modules/knowledge/rag/context-compressor.ts` | 新增 | 上下文压缩 |
| `modules/knowledge/brain/brain.types.ts` | 新增 | Brain 类型定义 |
| `modules/knowledge/brain/brain.schemas.ts` | 新增 | Zod 校验 |
| `modules/knowledge/brain/brain.repository.ts` | 新增 | Supabase 数据库访问 |
| `modules/knowledge/brain/brain.service.ts` | 新增 | 业务编排 |
| `modules/knowledge/brain/brain.routes.ts` | 新增 | RESTful 路由 |
| `modules/knowledge/migrations/002_add_brains.sql` | 新增 | 数据库迁移脚本 |
| `modules/knowledge/knowledge.service.ts` | 修改 | 使用 Processor Registry + Splitter + 自动关联 Brain |
| `modules/knowledge/knowledge.routes.ts` | 修改 | 注册 brain + search 路由 |
| `modules/knowledge/qa.service.ts` | 修改 | Query Rewrite + Context Compression |
| `modules/knowledge/search.service.ts` | 修改 | 移除冗余 buildContextFromResults |
| `modules/knowledge/knowledge.schemas.ts` | 修改 | 添加 SearchSchema |

### 前端 (src)

| 路径 | 操作 | 说明 |
|------|------|------|
| `features/knowledge/hooks/use-brains.ts` | 新增 | Brain CRUD Hooks |
| `features/knowledge/hooks/use-knowledge-search.ts` | 新增 | 搜索 Hook |
| `features/knowledge/components/brain-selector.tsx` | 新增 | 知识库选择器 |
| `features/knowledge/components/knowledge-search-bar.tsx` | 新增 | 搜索发现条 |
| `features/knowledge/components/qa-document-selector.tsx` | 新增 | QA 文档选择器 |
| `features/knowledge/types.ts` | 修改 | 添加 Brain 类型 |
| `features/knowledge/api.ts` | 修改 | 添加 Brain + Search API |
| `features/knowledge/components/knowledge-base-page.tsx` | 修改 | 集成 Brain 选择器 + 搜索条 + 文档选择器 |

### 数据库 (supabase)

| 路径 | 操作 | 说明 |
|------|------|------|
| `supabase/migrations/20260713010001_create_knowledge_base.sql` | 新增 | 文档、chunk、图谱与 QA 基础表 |
| `supabase/migrations/20260713010002_add_knowledge_brains.sql` | 新增 | 知识库表 + 关联表 + RLS |

## 五、数据库迁移说明

### 新建表

```sql
-- 知识库表
CREATE TABLE knowledge_brains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT DEFAULT NULL,
  embedding_provider TEXT DEFAULT 'dashscope',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 知识库-文档多对多关联
CREATE TABLE knowledge_brain_documents (
  brain_id UUID NOT NULL REFERENCES knowledge_brains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (brain_id, document_id)
);
```

### 自动数据迁移
- 为所有已有用户创建 1 个默认知识库
- 将用户的所有文档关联到默认知识库

## 六、构建验证

| 环境 | 状态 | 输出 |
|------|------|------|
| 前端 Vite Client | ✅ | 2779 modules, 无错误 |
| 前端 SSR (Nitro) | ✅ | 724ms, 无错误 |
| 后端 tsc | ✅ | 无错误 |
| 数据库 migration | ✅ | `knowledge_brains` 1 条, `knowledge_brain_documents` 1 条 |

## 七、后续方向

不推荐做的事情（Quivr 中有但对我们不适合的）：

| 功能 | 原因 |
|------|------|
| LangGraph 工作流编排 | TypeScript 生态不成熟，小型项目过重 |
| 多文件上传 session | 场景是逐个上传 |
| Brain 序列化到本地磁盘 | Supabase 做持久化 |
| 全量任务分解系统 | 面试知识库场景不需要 |

推荐的后续功能：

- **Reranker 接入**（Cohere / Jina）— 检索精排
- **大文件分片上传** — 替代当前单次 base64 上传
- **知识库导入/导出** — JSON 格式跨用户迁移
- **Embedding Provider 可切换** — 与项目的多模型机制一致
- **QA 会话消息分页** — 解决长历史加载问题
- **文档批量操作** — 多选删除、跨 Brain 移动
- **Vector index 优化** — Supabase pgvector 索引调优
