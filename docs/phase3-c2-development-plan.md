# C2 简历解析出题 — 开发方案

> 基于重构后的模块化架构
> 关联文档: [phase3-c2-improvement.md](../phase3-c2-improvement.md)（技术方案详情）
> 状态: 待实施

---

## 一、背景

### 当前 C2 状态

C2 功能经历了两次迭代：

- **初版**：浏览器端 `file.text()` 读取 `.txt/.md`，文本原样传参拼入 AI prompt
- **重构后**：项目整体切为模块化架构（`modules/` + `features/`），C2 前端代码已写入但使用的是旧式文本传参方式

### 需要解决的问题

| 问题 | 当前 | 目标 |
|---|---|---|
| 文件支持 | 仅 `.txt/.md` | `.pdf` / `.docx` / `.txt` / `.md` |
| 解析位置 | 浏览器 `file.text()` | 服务端 `pdf-parse` / `mammoth` |
| 传递方式 | 文本原文传参 `resumeText` | 引用 `resumeId` → 结构化分析 |
| AI 结构化提取 | 无 | 技能 / 项目 / 经验 / 评估 |
| 去重 | 无 | SHA-256 哈希 + 唯一索引 |
| 复用历史简历 | 无 | 简历库选择器 |

---

## 二、目标架构

```
[前端] 选择文件 (PDF/DOCX/TXT)
  │ multipart/form-data
  ▼
POST /api/resumes/upload ──→ [service] hash 去重判断
  │                              ├── 已存在 → 返回已有 resumeId
  │                              └── 新文件 → 继续
  │                              ├── 存 Supabase Storage
  │                              ├── [lib] resume-parser.ts 提取文本
  │                              └── [lib] resume-analyzer.ts AI 结构化
  ▼
返回 { resumeId, analysis } ──→ 前端展示技能标签 + 评估摘要

[创建面试时]
POST /api/sessions { ..., resumeId }
  │
  ▼
[sessions.service] 查 resumes.analysis
  │  拼接结构化数据进出题 prompt
  ▼
AI 出题：根据候选人"实际项目经历 + 技术栈"出题
```

---

## 三、文件清单

### 3.1 后端 — 新增 lib 工具

| 文件 | 职责 | 技术 |
|---|---|---|
| `api-server/src/lib/resume-parser.ts` | 文档格式解析 | pdf-parse + mammoth |
| `api-server/src/lib/resume-analyzer.ts` | AI 结构化提取 | DeepSeek → JSON |

### 3.2 后端 — 新增模块 modules/resumes/

| 文件 | 职责 |
|---|---|
| `api-server/src/modules/resumes/resumes.routes.ts` | 路由：POST upload、GET list、GET :id、DELETE :id |
| `api-server/src/modules/resumes/resumes.service.ts` | 编排：hash → 去重判定 → 存储 → 解析 → AI 分析 |
| `api-server/src/modules/resumes/resumes.repository.ts` | DB 操作：resumes 表 CRUD |
| `api-server/src/modules/resumes/resumes.schemas.ts` | Zod 校验（文件大小/类型） |

### 3.3 后端 — 修改现有文件

| 文件 | 改动 |
|---|---|
| `api-server/src/app.ts` | 注册 `app.route("/api/resumes", resumes)` |
| `api-server/src/modules/sessions/sessions.schemas.ts` | CreateSessionSchema 加 `resumeId?: string` |
| `api-server/src/modules/sessions/sessions.service.ts` | 有 resumeId 时查询 analysis 拼入 prompt |
| `api-server/src/modules/sessions/question-generation.service.ts` | prompt 构建支持结构化简历上下文 |

### 3.4 前端 — 新增 feature

| 文件 | 职责 |
|---|---|
| `src/features/resumes/api.ts` | `uploadResume()` / `listResumes()` / `deleteResume()` |
| `src/features/resumes/types.ts` | ResumeAnalysis / ResumeListItem 等类型 |
| `src/features/resumes/components/ResumeUploader.tsx` | 文件选择 + 上传进度 + 解析预览 |
| `src/features/resumes/components/ResumeSelector.tsx` | 历史简历选择器 |

### 3.5 前端 — 修改现有文件

| 文件 | 改动 |
|---|---|
| `src/features/interview-create/new.tsx` | 集成 ResumeUploader，替换旧 resumeText 传参 |
| `src/shared/api/http-client.ts` | 添加 resume API 方法（如果使用统一客户端） |

### 3.6 数据库迁移

```
supabase/migrations/YYYYMMDD_create_resumes.sql
```

---

## 四、数据库设计

### 4.1 resumes 表

```sql
CREATE TABLE public.resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INT,
  file_hash TEXT NOT NULL,                    -- SHA-256
  storage_path TEXT,                          -- Supabase Storage 路径
  parsed_text TEXT NOT NULL,
  analysis JSONB DEFAULT NULL,
  -- analysis 内容示例:
  -- {
  --   "skills": ["React", "TypeScript", "Node.js"],
  --   "workExperience": [{ "company": "字节跳动", "role": "前端工程师", "years": "3年" }],
  --   "projects": [{ "name": "xxx", "techStack": [...], "description": "..." }],
  --   "education": { "school": "华中科技大学", "major": "计算机", "degree": "本科" },
  --   "overallAssessment": "3年前端经验，React 技术栈深入",
  --   "suggestedQuestions": ["追问项目难点", "考察状态管理方案"]
  -- }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, file_hash)
);
```

### 4.2 interview_sessions 加 resume_id

```sql
ALTER TABLE public.interview_sessions
  ADD COLUMN resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL;
```

### 4.3 RLS 策略

- resumes 表：用户只能看到自己的简历
- interview_sessions 的 resume_id 通过外键约束

### 4.4 Supabase Storage

- Bucket: `resumes`
- 路径: `{userId}/{timestamp}_{fileName}`
- 公开读/私有写

---

## 五、后端 API 设计

### POST /api/resumes/upload

上传简历文件，全流程同步执行。

```
Request:  multipart/form-data, file ≤ 10MB
Response: {
  id: string,
  fileName: string,
  fileSize: number,
  parsedText: string,
  analysis: ResumeAnalysis,
  isDuplicate: boolean,
  createdAt: string
}
```

### GET /api/resumes

当前用户的所有简历列表。

```
Response: ResumeListItem[]
```

### GET /api/resumes/:id

单份简历详情。

### DELETE /api/resumes/:id

删除简历（含 Storage 文件 + 数据库记录）。

---

## 六、文档解析方案

| 格式 | 库 | 安装 |
|---|---|---|
| `.pdf` | `pdf-parse` | `pnpm --filter api-server add pdf-parse` |
| `.docx` | `mammoth` | `pnpm --filter api-server add mammoth` |
| `.txt/.md` | 原生 Buffer.toString() | 无需安装 |

**resume-parser.ts** 核心逻辑：

```typescript
export async function parseResume(
  buffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<{ text: string; pageCount?: number }> {
  if (contentType.includes("pdf") || fileName.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    return { text: data.text, pageCount: data.numpages };
  }
  if (contentType.includes("word") || /\.docx?$/i.test(fileName)) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value };
  }
  return { text: buffer.toString("utf-8") };
}
```

---

## 七、AI 结构化分析方案

调用 DeepSeek API，从简历纯文本中提取结构化信息。

**Prompt 要点**：

```
你是一位技术简历分析专家。
从以下简历中提取结构化信息，返回 JSON：
skills[], workExperience[{company, role, years}],
projects[{name, techStack, description}],
education{school, major, degree},
overallAssessment, suggestedQuestions[]
```

**出题集成**：在 `question-generation.service.ts` 中，如果 session 关联了 resume，prompt 里不再传原文，而是传结构化字段：

```
候选人技术栈: React, TypeScript, Node.js
项目经历: 电商平台（React + Redux + Node.js）
          - 负责商品列表页性能优化
综合评估: 3年前端经验，React 技术栈深入

## 出题要求
- 优先针对候选人实际项目经历出题
- 项目细节题占 60%，基础原理题占 40%
```

---

## 八、实施步骤

### 前置（已确认）

```
[✓] pnpm 切换方案已确认
[✓] 架构模式已确定（modules/ + features/）
[✓] 参考资料已准备 phase3-c2-improvement.md
[ ] 数据库迁移尚未执行
[ ] 依赖尚未安装
```

### Step 1 — 安装依赖

```bash
pnpm --filter api-server add pdf-parse mammoth
```

### Step 2 — 数据库迁移

1. 创建 `supabase/migrations/YYYYMMDD_create_resumes.sql`
2. 含 resumes 表 + interview_sessions.resume_id + RLS
3. 在 Supabase Dashboard 创建 `resumes` Storage bucket

### Step 3 — 后端 lib 工具

1. 创建 `resume-parser.ts`（pdf-parse + mammoth 调用）
2. 创建 `resume-analyzer.ts`（DeepSeek 结构化提取）

### Step 4 — 后端模块

1. 创建 `modules/resumes/resumes.schemas.ts`
2. 创建 `modules/resumes/resumes.repository.ts`
3. 创建 `modules/resumes/resumes.service.ts`
4. 创建 `modules/resumes/resumes.routes.ts`
5. 在 `app.ts` 注册路由

### Step 5 — 出题集成

1. `sessions.schemas.ts` 加 `resumeId`
2. `sessions.service.ts / question-generation.service.ts` 读取 analysis 拼入 prompt

### Step 6 — 前端 feature

1. 创建 `features/resumes/types.ts`
2. 创建 `features/resumes/api.ts`
3. 创建 `features/resumes/components/ResumeUploader.tsx`
4. 创建 `features/resumes/components/ResumeSelector.tsx`

### Step 7 — 前端集成

1. `interview-create/new.tsx` 集成 ResumeUploader
2. 移除旧的 resumeText 传参逻辑

### Step 8 — 编译验证

```bash
pnpm build
pnpm --filter api-server build
```

---

## 九、依赖

| 包 | 版本 | 用途 | 安装方式 |
|---|---|---|---|
| `pdf-parse` | latest | 服务端 PDF → 纯文本 | `pnpm --filter api-server add` |
| `mammoth` | latest | 服务端 DOCX → 纯文本 | `pnpm --filter api-server add` |

---

## 十、风险

| 风险 | 概率 | 应对 |
|---|---|---|
| 扫描版 PDF 无法提取文字 | 中 | 前端提示"仅支持文字版 PDF" |
| 大文件上传超时 | 低 | 限制 10MB，前端显示进度 |
| AI 分析耗时过长 | 中 | 同步执行，前端 loading 态 |
| .doc 格式兼容 | 低 | 先只做 .docx，提示用户另存 |
