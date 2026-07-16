# 数据模型设计

> 状态：当前；最后核验：2026-07-16

## 1. 数据设计原则

- 所有用户数据以 `user_id` 或可验证的父级关系隔离。
- 用户作用域 API 使用 Supabase access token 和 RLS。
- 关键状态转换通过 `SECURITY DEFINER` RPC 原子提交，并在函数内再次验证 `auth.uid()`。
- 模型输出、事件和 JSONB 在数据库层限制字段、长度和敏感键。
- 历史迁移不可修改，只添加唯一时间戳的增量迁移。

## 2. 关系概览

```text
auth.users
  +-- profiles
  +-- user_settings
  +-- resumes
  +-- favorite_questions -> question_bank
  +-- interview_sessions
  |     +-- interview_questions
  |     |     +-- interview_messages
  |     |     +-- answer_evidence
  |     |     +-- question_evaluations
  |     +-- agent_events / operations / runs
  |     +-- strategies / activities / tool_runs / citations
  |     +-- agent_research_sources
  +-- agent_training_profiles
  +-- knowledge_documents -> knowledge_chunks -> graph_edges
  +-- knowledge_brains <-> knowledge_brain_documents
  +-- qa_sessions -> qa_messages
```

## 3. 用户与配置

| 表              | 关键字段                                               | 说明                      |
| --------------- | ------------------------------------------------------ | ------------------------- |
| `profiles`      | `id`, `display_name`                                   | 与 auth user 一一对应     |
| `user_settings` | `user_id`, `model_provider`, `model_name`, `*_api_key` | Key 保存 AES-256-GCM 密文 |
| `resumes`       | `user_id`, `file_name`, `parsed_text`, `analysis`      | 简历原文与结构化分析      |

## 4. 面试核心

### 4.1 `interview_sessions`

会话聚合根，包含：

- 用户、岗位、难度、题量、JD、公司、Skill、简历和模型。
- `agent_version`、`agent_mode`、冻结 `agent_config`/`agent_plan`。
- 当前题、题号、追问次数、阶段和事件水位。
- 产品状态、准备/完成时间、报告和维度摘要。

新会话只通过 Agent v3 创建 RPC 写入。历史 v1/v2 值仅用于只读兼容。

### 4.2 `interview_questions`

保存题目正文、全局顺序、角色、主维度、来源、反馈和兼容分数。当前 Agent 评分真相位于 `question_evaluations`。

### 4.3 `interview_messages`

保存每题有序的 user/assistant 消息、角色、轮次类型、关键词和打断状态。所有权通过所属 session 验证。

## 5. Agent 表

| 表                          | 职责                                            |
| --------------------------- | ----------------------------------------------- |
| `agent_events`              | 严格递增持久事件，支持 SSE 重放                 |
| `agent_operations`          | 幂等 claim/commit/fail 和第一次结果             |
| `agent_runs`                | 模型/节点运行审计、耗时、token 和稳定错误码     |
| `agent_research_sources`    | 清洗、去重、可追溯的研究来源                    |
| `answer_evidence`           | 候选人消息的引用证据                            |
| `question_evaluations`      | 冻结维度评分和 overall                          |
| `agent_strategy_revisions`  | Planner/Reflection 策略版本、题目标准和观察引用 |
| `agent_activities`          | 脱敏活动时间线                                  |
| `agent_tool_runs`           | 白名单工具执行和受限结果上下文                  |
| `agent_knowledge_citations` | Brain/研究引用                                  |
| `agent_training_profiles`   | 授权、维度聚合和重复弱项                        |

Agent JSONB 使用 `_agent_json_has_sensitive_key()` 防止 key/token/authorization/secret 等敏感键持久化。

## 6. 题库

| 表                   | 说明                                                |
| -------------------- | --------------------------------------------------- |
| `question_bank`      | 公共题目、岗位、难度、题型、Skill、角色、维度和主题 |
| `favorite_questions` | 用户与题目的收藏关系                                |

题库对已认证用户可读，收藏只能由所属用户管理。

## 7. 知识库

| 表                          | 关键字段                                            |
| --------------------------- | --------------------------------------------------- |
| `knowledge_documents`       | 文件元数据、hash、chunk 数、processing/ready/failed |
| `knowledge_chunks`          | 内容、token 数、`embedding vector(1024)`            |
| `knowledge_graph_edges`     | source/target chunk、similarity                     |
| `knowledge_brains`          | 用户知识库集合                                      |
| `knowledge_brain_documents` | Brain 与文档多对多关系                              |
| `qa_sessions`               | 标题、选中文档 ID、消息数                           |
| `qa_messages`               | user/assistant 内容、引用和 token 用量              |

向量索引使用 cosine ops；所有表启用用户所有权 RLS。

## 8. LangGraph Checkpoint

`langgraph` schema 由 PostgresSaver 使用：

- `checkpoint_migrations`
- `checkpoints`
- `checkpoint_blobs`
- `checkpoint_writes`

Checkpoint 只保存必要控制状态和引用，不保存回答正文、简历原文、网页全文或凭据。生产必须配置 `DATABASE_URL`。

## 9. 关键 RPC

### 会话与幂等

- `create_agent_interview_session`
- `claim_agent_operation`
- `commit_agent_operation`
- `fail_agent_operation`
- `accept_agent_input`

### Agent v3

- `commit_agent_v3_strategy_revision`
- `commit_agent_v3_preparation`
- `commit_agent_v3_question`
- `commit_agent_v3_question_evaluation`
- `record_agent_activity`
- `get_agent_v3_workspace`
- `check_agent_readiness`

### 生命周期与记忆

- `manage_agent_session_lifecycle`
- `delete_agent_session`
- `set_agent_training_memory`
- `clear_agent_training_memory`
- `commit_agent_training_summary`

旧 v1/v2 RPC 可能仍因历史迁移存在，但新代码不得调用。

## 10. 迁移规则与风险

当前仓库早期存在重复迁移版本，远端 migration history 也没有可靠基线。因此：

1. 不修改已提交历史迁移。
2. 新迁移使用新的唯一时间戳。
3. 生产变更前只读比对 schema、函数签名、约束和 RLS。
4. 在迁移历史基线治理完成前，不执行全量 `supabase db push`、`db reset` 或 repair。
5. 回滚优先关闭功能开关或部署旧代码，不删除向后兼容的新列/表。

## 11. 历史残留

`background_jobs` 和渐进生成字段/RPC 可能仍存在于 schema，但当前代码没有 generation Worker、Redis 或 BullMQ 消费者。它们不是当前运行链路。
