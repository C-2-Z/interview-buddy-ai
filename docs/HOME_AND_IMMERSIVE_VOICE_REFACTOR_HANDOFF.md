# 首页双入口与沉浸式语音面试重构交接

## 实现结果

- `/interview-hub` 已迁入 `_focus` 认证布局，只保留文本面试与语音面试两个主入口和轻量账户菜单。
- 文本创建页固定为文本模式；文本会话支持多行回答和按会话恢复本地草稿。
- 新增 `/voice/new` 语音准备厅，开始前并行完成服务可用性、麦克风权限、AudioContext 和全屏准备。
- 新增 `/voice/session/$id` 沉浸式语音面试间，提供语音状态、字幕、暂停/继续、手动结束回答、恢复操作、全屏和文本降级。
- 语音会话继续使用同一 Agent Graph；降级为文本不会创建第二套业务状态机。
- 语音完成后进入原有统一报告展示；旧语音会话入口会迁移到新的沉浸式路由。

## 可靠性与隐私

- readiness 现在分别检查语音 API Key、ASR 地址与 TTS 地址；创建服务会在数据库写入前再次校验 readiness。
- 语音前端将本地播放结束和服务端回合事件对齐，避免 AI 仍在播报时提前进入聆听态。
- 用户语音只以转写答案进入会话记录，当前实现不保存原始音频。
- 页面离开、连接失败和设备失败均有明确恢复路径；Wake Lock 与全屏能力不可用时采用渐进降级。

## 路由和模块

- 共享认证：`src/features/auth-session/`
- 双入口首页：`src/features/interview-hub/`
- 文本面试：`src/features/interview-agent/`
- 沉浸式语音：`src/features/immersive-voice-interview/`
- 专注路由：`src/routes/_focus/`
- 服务端 readiness：`api-server/src/modules/agent-readiness/`
- 服务端语音桥：`api-server/src/modules/voice/`

## 验收边界

自动化验证覆盖类型检查、前后端生产构建、readiness、创建前二次校验、创建错误恢复和语音体验状态机。应用内浏览器验证了未登录路由守卫和 375px 视口无横向溢出。

当前浏览器没有已登录的 Supabase 会话，因此本轮没有绕过认证，也没有授予麦克风权限。发布前仍需在已配置真实 Qwen ASR/TTS 的环境中完成一次登录态真机验收：进入准备厅、允许麦克风、完成至少一轮问答、模拟断网恢复、降级文本并查看最终报告。
