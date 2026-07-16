# 测试与质量保证

> 状态：当前；最后核验：2026-07-16

## 1. 质量目标

- 业务控制流可重复、可恢复且不依赖模型偶然输出。
- 用户隔离、敏感数据和模型/网页信任边界有自动化证据。
- 文字、语音、知识库和跨端基础具备独立测试入口。
- 发布前完成 lint、测试、构建和必要的真实设备验收。

## 2. 测试分层

| 层                  | 目标                                         | 示例                                        |
| ------------------- | -------------------------------------------- | ------------------------------------------- |
| 单元测试            | 纯函数、schema、状态机、聚合                 | role plan、input guard、评分、报告          |
| Service 测试        | 业务流程和依赖故障                           | readiness、lifecycle、memory、orchestration |
| Repository 契约测试 | RPC 参数、字段映射、敏感输出拒绝             | Agent repository、workspace                 |
| Graph 测试          | interrupt/resume、角色/题量、checkpoint 安全 | MemorySaver 与可选 PostgresSaver            |
| 协议测试            | SSE 游标、语音 turn、重复提交                | event stream、voice bridge                  |
| 集成测试            | 知识库处理、迁移和 OpenAPI                   | knowledge integration                       |
| 构建验证            | SSR、Native、API、秘密边界                   | Vite、tsc、verify-native                    |
| 人工验收            | 浏览器、真实麦克风、Windows 安装             | 端到端产品体验                              |

## 3. 当前自动化入口

### 根项目

```powershell
npm test
npm run lint
npm run build
npm run build:native:dev
npm run verify:native
```

### API

```powershell
Set-Location api-server
npm test
npm run test:coverage:acceptance
npm run build
```

### Checkpoint 集成

```env
AGENT_TEST_DATABASE_URL=postgresql://isolated-test-database
```

未配置时 PostgresSaver 集成测试按设计跳过，绝不自动使用业务 `DATABASE_URL`。

## 4. 2026-07-16 基线

- 根项目：16 项通过。
- API：143 项通过，1 项隔离 PostgreSQL 测试跳过。
- Web SSR 构建通过。
- Native SPA development 构建和秘密边界验证通过。
- API TypeScript 构建通过。
- ESLint 0 error、3 个现有 shadcn Fast Refresh warning。
- 主入口 chunk 约 624 kB，存在非阻塞体积警告。

## 5. 必测业务不变量

### Agent

- 关闭开关不回退旧写链路。
- 创建前 readiness 阻断缺失迁移、checkpoint 或模型 Key。
- 创建返回 202，后台准备最终到 `awaiting_answer`。
- 相同 inputId 和并发 claim 只推进一次。
- 回答正文和凭据不进入 state/checkpoint。
- panel 覆盖全部角色和题目。
- 最多三次追问。

### 输入与模型

- 空白、超长、复制题目和注入被拒绝。
- 模型非法 JSON/schema 的 repair 和失败路径正确。
- 网页恶意指令不能关闭不可信边界。
- 工具 allowlist 拒绝任意 SQL、Shell 和写能力。

### 评分与报告

- 证据来自候选人消息和冻结维度。
- 主维度无证据为 0，辅助未观察不计分。
- Overall 按冻结权重重算。
- 报告拒绝不完整评分，不调用模型自由改总分。

### 恢复与语音

- SSE 初连、重连、游标过期和游标领先均正确。
- 重复 voice turn 不重复 TTS。
- simulation 不暴露 activity/score。
- 打断同时取消 Agent 和 Provider。

### 数据与权限

- Repository 查询包含用户/会话/角色/状态过滤。
- 敏感数据库输出在边界被拒绝。
- 知识库 schema 拒绝无界搜索和非法批量 ID。
- 迁移版本唯一且向量维度为 1024。

## 6. 人工验收清单

### Web

- [ ] 注册、登录、刷新和退出。
- [ ] 375/390/768/1024/1440 px 无横向溢出。
- [ ] 创建草稿、readiness、失败恢复。
- [ ] 文字面试完整闭环、刷新和断网重连。
- [ ] 暂停/恢复/提前结束/放弃/删除。
- [ ] 报告与弱项复练。
- [ ] 简历、题库、知识库、QA 和图谱。

### 真实语音设备

- [ ] 麦克风授权和设备预检。
- [ ] ASR partial/final、TTS 首包和多轮。
- [ ] 用户打断和结束回答。
- [ ] 网络中断恢复和文字降级。
- [ ] 原始音频未持久化。

### Tauri

- [ ] 安装、启动、登录保持。
- [ ] 文件选择和系统浏览器打开。
- [ ] 麦克风、WebSocket、SSE、CSP。
- [ ] 窗口缩放、最大化、卸载和升级。

## 7. 发布门禁

发布前必须满足：

1. 相关测试无失败。
2. lint 无 error。
3. Web、API 和目标 Native build 通过。
4. `verify:native` 和 `git diff --check` 通过。
5. 新迁移在隔离环境验证且有回滚方案。
6. 环境变量和 CORS/CSP 经双人复核。
7. 用户主链路有人工验收证据。

## 8. 测试数据规则

- 不在测试输出中打印真实 token、Key、回答或简历。
- E2E 用户应一次性创建并在测试后清理。
- 生产数据库只读核验需要明确授权；写入、迁移和删除必须再次授权。
- 性能结论必须记录环境、样本数、冷/热启动和 P50/P95，不能用单次最快值。
