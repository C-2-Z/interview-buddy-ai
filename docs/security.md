# 安全设计与隐私边界

> 状态：当前；最后核验：2026-07-16

## 1. 安全目标

- 用户只能访问自己的数据。
- 密钥、token、数据库密码和敏感正文不进入客户端、日志、事件或 checkpoint。
- 用户输入、模型输出和外部网页均视为不可信。
- 状态推进必须可审计、幂等且不能被模型绕过。

## 2. 信任边界

```text
不可信：浏览器输入、文件、网页、模型输出
  -> Zod/大小/类型/HTML/URL/schema/证据校验
可信业务层：Service + Repository + RPC
  -> RLS/auth.uid()/所有权/约束
敏感外部层：数据库、Provider Key、Checkpoint
```

## 3. 认证与授权

- 前端从 Supabase Session 获取 access token。
- API `requireAuth` 验证 Bearer JWT claims，并创建用户作用域 Supabase 客户端。
- RLS 对 profiles、sessions、messages、resumes、settings、Agent 表和知识库表执行所有权隔离。
- `SECURITY DEFINER` RPC 必须显式验证 `auth.uid()`，设置受限 `search_path`。
- Service role 只用于 readiness 等必要管理检查，不得进入浏览器。

## 4. 密钥管理

- 用户 Provider Key 使用 AES-256-GCM 和 64 位十六进制 `ENCRYPTION_KEY` 加密。
- 设置接口只返回 `set` 和 masked 值。
- 运行时 Key 优先用户 BYOK，其次服务端环境变量；只留在服务端内存。
- `VITE_*` 只能包含公开配置。Service role、AI Key、数据库 URL、语音签名密钥不得使用该前缀。
- 日志 reporter 自动过滤 key/token/authorization/secret 类字段。

## 5. Agent 数据最小化

- Frozen config 不包含凭据。
- Graph State/checkpoint 不包含回答正文、简历原文、网页全文或模型思维链。
- 输入正文先写业务存储，Graph 只保存 inputId。
- 活动、策略和工具结果只保存用户可见摘要、引用和受限上下文。
- `agent_runs` 只记录模型、耗时、token、版本和稳定错误码。

## 6. 输入防护

- Zod 校验 UUID、枚举、长度、题量和 JSON 结构。
- 简历限制 10 MB，知识库限制支持类型和批量数量。
- Agent input guard 拒绝空白、超长、复制题目和 Prompt 注入。
- 客户端 turn/input ID 只接受有限字符和长度。
- 数据库 JSONB 检查敏感键、类型和字节长度。

## 7. 模型输出防护

- 问题、追问、策略和评分使用严格 schema。
- 只允许一次 repair；不能把解析失败静默当作成功。
- 模型不能修改题量、角色、追问上限、权重、工具 allowlist 和结束条件。
- 证据必须引用真实候选人消息；总分由代码重算。
- 不持久化思维链，只保存稳定原因码和业务结果。

## 8. 外部资料防护

- 搜索只通过固定 Provider adapter。
- URL、协议、重定向、域名、数量和正文长度受限。
- HTML/控制字符被清理，结果去重并哈希。
- 网页内容以“不可信资料”边界进入 Prompt，其中指令不得执行。
- 无 Provider 时返回空结果并安全降级，不允许 Agent 任意联网。

## 9. 语音安全

- voice/connect 只允许冻结为 voice 的所属会话。
- WSS 使用两分钟、单次消费 HMAC token，并再次验证 Supabase JWT。
- 音频必须关联当前题和合法 turnId。
- 原始 PCM 不写数据库；只保存 final transcript。
- 生产只允许 WSS。

当前 token 存在 API 进程内存：单副本可用，多副本必须使用粘性路由或共享一次性存储，并实现未消费 token 的过期清理。

## 10. 前端与跨端

- Native 生产 API 必须 HTTPS。
- Tauri CSP 只允许所需 API、Supabase 和资源来源。
- 平台能力集中封装，受限 WebView 安全降级。
- 草稿位于本机 storage，不保存 API Key；共享设备使用后应退出登录。

## 11. 安全检查清单

- [ ] 新接口已启用认证和所有权检查。
- [ ] 新表已启用 RLS 并测试跨用户拒绝。
- [ ] 新 JSON/event/checkpoint 不含敏感字段和正文。
- [ ] 新模型输出有 schema、长度和失败策略。
- [ ] 新外部内容有不可信边界和清理。
- [ ] 日志不打印请求体、token、Key、简历或回答全文。
- [ ] 并发/重复请求不会重复扣费或推进。
- [ ] 生产变量没有错误的 `VITE_` 前缀。
