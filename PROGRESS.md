# C0 Skill 驱动出题 + 历史去重 — 开发进度

## 当前阶段：已完成 ✅

### 已完成
- Step 1: 数据库迁移 — 创建 migration 文件，添加 skill_id + topic_summary 字段
- Step 2: Skill 基础设施 — 类型定义 (skill-schema.ts)、Loader (index.ts)、分配算法 (allocator.ts)
- Step 2b: 4 个 Skill 定义 — java-backend / frontend / algorithm / product（各含 skill.json + persona.md）
- Step 2c: 13 个共享参考题库文件 — java/mysql/redis/spring/system-design/html-css/js-ts/frontend-framework/ds-algo/ml-basics/dl-basics/ml-engineering/product-thinking/product-data/product-strategy/project
- Step 3: 新增 GET /api/skills 路由 — 返回所有 Skill 元数据
- Step 4: 改造 POST /api/sessions — 支持 skillId，Skill 模式使用结构化 prompt + 分类分配 + 参考题库 + 历史去重；兼容旧模式
- Step 5: 前端 api-client — 新增 SkillMeta 类型、listSkills 方法、CreateSessionParams.skillId
- Step 6: 前端创建页改造 — Skill 卡片选择 UI + 自定义兜底输入
- Step 7: 类型定义更新 — 同步更新前端和后端的 Supabase 类型
- Step 8: 编译验证 — API server (tsc) ✅ + 前端构建 (vite build) ✅
- Step 9: 端到端测试 — /api/health ✅ /api/skills (4 skills) ✅ 分配算法单元测试 ✅
- Step 10: 修正 — ALWAYS_ONE 分配算法 bug 修复（Phase 2 不再重复分配）

### 问题 & 解决方案
- 问题: allocate 算法 Phase 2 将 ALWAYS_ONE 加入分配池导致其获取 2 题
  解决: Phase 2 分配池只包含 CORE + NORMAL
- 问题: Supabase 类型文件中缺少 skill_id / topic_summary 列
  解决: 同步更新 src/integrations/supabase/types.ts 和 api-server/src/lib/supabase-types.ts
