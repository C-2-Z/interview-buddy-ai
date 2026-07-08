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

---

## Phase 2 — 面试体验增强

### P1 — 第一优先级

 - [x] A4 追问策略优化 — 改进 AI 面试官的 Prompt，使其追问更具深度和针对性
 - [ ] A2 限时模式 — 每题倒计时功能

### P2 — 第二优先级

- [ ] A1 语音回答 — 麦克风录入 + STT 转换
- [ ] A3 编程题 + 在线编辑器 — 内置代码编辑器 + AI 代码评审

---

## Phase 3 — 数据与反馈深化

- [ ] B1 能力雷达图 / 趋势图表 — 多维度能力可视化
- [ ] B2 薄弱点识别与推荐练习 — AI 自动分析薄弱点
- [ ] B3 面试报告导出 — PDF / 文档导出

---

## Phase 4 — 出题与配置扩展

- [ ] C1 公司定制出题 — 基于目标公司出题
- [ ] C2 简历解析出题 — 上传简历生成个性化题目
- [ ] C3 题型混合配置 — 题型比例自定义
- [ ] C4 题库模式 — 公共题库 + 刷题模式

---

## Phase 5 — 平台与基础设施

 - [x] D1 多模型支持 — DeepSeek / GPT-4o / Claude 切换（开发中）
- [ ] D2 忘记密码 / 邮箱验证 — Supabase Auth 完善
- [ ] D3 移动端适配优化 — 手机体验改进
- [ ] D4 App 打包 — Capacitor (Android/iOS) + Tauri (Windows)
- [ ] D5 中英文双语支持 — UI + 面试语言切换
- [ ] D6 分享面试 — 分享链接生成
