# Phase 3 / C2 简历解析出题 — 开发进度追踪

> 遵循开发计划: docs/phase3-c2-development-plan.md
> 启动日期: 2026-07-09

---

## 总体进度

- [ ] Step 0 — pnpm workspace 切换
- [ ] Step 1 — 安装依赖 (pdf-parse + mammoth)
- [ ] Step 2 — 数据库迁移
- [ ] Step 3 — 后端 lib 工具 (resume-parser.ts + resume-analyzer.ts)
- [ ] Step 4 — 后端模块 (modules/resumes/)
- [ ] Step 5 — 出题集成 (sessions schema + prompt)
- [ ] Step 6 — 前端 feature (features/resumes/)
- [ ] Step 7 — 前端集成 (new.tsx)
- [ ] Step 8 — 编译验证
- [ ] Step 9 — 端到端测试

---

## 详细记录

### Step 0 — pnpm workspace 切换
- [ ] 创建 pnpm-workspace.yaml
- [ ] 创建 .npmrc (shamefully-hoist)
- [ ] 删除 package-lock.json 文件
- [ ] 运行 pnpm install
- [ ] 验证构建

### Step 1 — 安装依赖
- [ ] pnpm --filter api-server add pdf-parse mammoth

### Step 2 — 数据库迁移
- [ ] 创建 resumes 表 SQL 迁移文件
- [ ] 执行迁移

### Step 3 — 后端 lib 工具
- [ ] 创建 resume-parser.ts
- [ ] 创建 resume-analyzer.ts

### Step 4 — 后端模块
- [ ] resumes.schemas.ts
- [ ] resumes.repository.ts
- [ ] resumes.service.ts
- [ ] resumes.routes.ts
- [ ] app.ts 注册路由

### Step 5 — 出题集成
- [ ] sessions.schemas.ts 加 resumeId
- [ ] sessions.service.ts 引用 analysis

### Step 6 — 前端 feature
- [ ] features/resumes/types.ts
- [ ] features/resumes/api.ts
- [ ] features/resumes/components/ResumeUploader.tsx
- [ ] features/resumes/components/ResumeSelector.tsx

### Step 7 — 前端集成
- [ ] new.tsx 集成 ResumeUploader
- [ ] 移除旧 resumeText 逻辑

### Step 8 — 编译验证
- [ ] 前端 npm run build

### Step 9 — 端到端测试
- [ ] 创建面试 → 上传简历 → 验证出题

---

## 阻塞问题记录
（暂无）
