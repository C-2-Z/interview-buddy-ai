# AI 面试模拟器 — 开发路线图 (TODO)

> 优先级: P0=最高, P1=高, P2=中, P3=低

---

## Phase 1 — 已完成功能 ✅

- [x] 着陆页 (/) — 品牌展示 + CTA
- [x] 用户认证 (/auth) — 邮箱/密码登录注册
- [x] 仪表盘 (/dashboard) — 功能入口
- [x] 创建面试 (/new) — AI 出题配置
- [x] 面试会话 (/session/$id) — 多轮对话 + 评分 + 完成
- [x] 面试完成页 — 综合评分 + 逐题反馈
- [x] 历史记录 (/history) — 列表回顾
- [x] 认证布局 — 全局导航 + 鉴权守卫

## Phase 1b — 已完成的架构重构 ✅

- [x] 前后端分离重构 — 提取独立 Hono API 服务 (api-server/)
- [x] API 客户端 — src/lib/api-client.ts 替代 createServerFn
- [x] 路由组件更新 — new / history / session 页面改为 API 调用
- [x] 开发代理配置 — Vite /api 代理到 API 服务
- [x] 一键启动脚本 — AI面试官助手.ps1 支持双服务启动
- [x] 文档更新 — README / AGENTS / requirements 同步

## Phase 1c — 已验证的基本功能 ✅

根据 [comparison-analysis.md](./comparison-analysis.md) 功能矩阵验证，以下基础功能已可用：

- [x] C1 公司定制出题 — 基于目标公司出题 ✅ 已验证
- [x] C3 题型混合配置 — 题型比例自定义 ✅ 已验证
- [x] C4 题库模式 — 公共题库 + 刷题模式 ✅ 已验证
- [x] C0 Skill 驱动出题 + 历史去重 — 按岗位定义 SKILL.md 配置，出题前过滤已出题目 ✅ 已验证

---

## Phase 2 — 面试体验增强

### P1 — 第一优先级
- [ ] A4 追问策略优化 — 改进 AI 面试官的 Prompt，使其追问更具深度和针对性
- [ ] A2 限时模式 — 每题倒计时功能
- [ ] A5 前端性能优化 — TanStack Router 路由级懒加载 + 骨架屏，改善首屏加载速度
### P2 — 第二优先级

- [ ] A1 语音回答 — 麦克风录入 + STT 转换（可先用 Web Speech API 做 MVP）
- [ ] A3 编程题 + 在线编辑器 — 内置代码编辑器 + AI 代码评审

---

## Phase 3 — 数据与反馈深化

### P0 — 核心竞争力

- [ ] C2 简历解析出题 — 支持 PDF/DOCX 上传，AI 提取分析原简历并基于简历生成个性化题目（移自 Phase 4，提升至 P0）

### P1 — 体验提升

- [ ] B1 能力雷达图 / 多维评分体系 — LLM 结构化输出多维度评分（技术/沟通/逻辑/深度）+ Recharts 雷达图展示 + 趋势图表

### P2 — 第二优先级

- [ ] B2 薄弱点识别与推荐练习 — AI 自动分析薄弱点
- [ ] B3 面试报告导出 — PDF 文档导出
- [ ] C5 知识库 / RAG 问答 — 利用 Supabase pgvector 存储向量，文档辅助出题（P2 高级特性）

---

## Phase 4 — 出题与配置扩展（已完成）

> C0（Skill 驱动出题）、C1（公司定制）、C3（题型配置）、C4（题库模式）均已完成，移至 Phase 1c ✅
> C2（简历解析出题）已提升至 P0 并移至 Phase 3
> 此 Phase 已无待办项。

## Phase 5 — 平台与基础设施

### P0 — 核心竞争力

- [x] D1 多模型支持 — 支持 DeepSeek / GPT-4o / Claude Provider 切换，用户设置页可配置加密 API Key

### P1 — 体验提升

- [ ] D7 Docker 容器化部署 — Dockerfile + docker-compose.yml，一键部署标准化
- [ ] D2 忘记密码 / 邮箱验证 — Supabase Auth 完善

### P2 — 第二优先级

- [ ] D3 移动端适配优化 — 手机体验改进
- [ ] D4 App 打包 — Capacitor (Android/iOS) + Tauri (Windows)
- [ ] D5 中英文双语支持 — UI + 面试语言切换
- [ ] D6 分享面试 — 分享链接生成
- [ ] D8 异步任务处理 — 长任务（批量出题/评分）改为异步，前端轮询进度，大并发下更稳定
