# 首页双入口与沉浸式语音面试重构交接

## 实现结果

- `/interview-hub` 保留在 `_authenticated` 认证布局中，继续使用统一 AppShell 左侧导航，同时将主体收敛为文字面试和语音面试两个入口。
- 文本创建页固定为文字模式；文本会话支持多行回答和按会话恢复本地草稿。
- `/voice/new` 提供语音准备厅，开始前并行检查服务可用性、麦克风权限、AudioContext 和全屏准备。
- `/voice/session/$id` 提供沉浸式语音面试间，包含语音状态、字幕、暂停/继续、手动结束回答、恢复、全屏与文字降级。
- 语音会话继续使用同一 Agent Graph，降级为文本时不会创建第二套业务状态机。
- 文字与语音面试完成后进入统一报告页；旧语音会话入口会迁移到新的沉浸式路由。

## 可靠性与隐私

- readiness 分别检查语音 API Key、ASR 地址与 TTS 地址；创建服务在数据库写入前再次校验 readiness。
- 语音前端对齐本地播放结束和服务端回合事件，避免 AI 播报期间提前进入聆听态。
- 用户语音只以转写答案进入会话记录，当前实现不保存原始音频。
- 页面离开、连接失败和设备失败均有明确恢复路径；Wake Lock 与全屏能力不可用时采用渐进降级。

## 路由与模块

- 共享认证：`src/features/auth-session/`
- 双入口首页：`src/features/interview-hub/`
- 统一侧栏布局：`src/features/app-shell/` 与 `src/routes/_authenticated.tsx`
- 文本面试：`src/features/interview-agent/`
- 沉浸式语音：`src/features/immersive-voice-interview/`
- 语音专注路由：`src/routes/_focus/`
- 服务端 readiness：`api-server/src/modules/agent-readiness/`
- 服务端语音桥：`api-server/src/modules/voice/`

## 验收结果与边界

类型检查、前后端测试和生产构建均纳入本轮验收。登录态 Chrome 已验证 `/interview-hub` 显示统一左侧导航、文字/语音两个入口，且桌面视口无横向溢出。

发布前仍建议在配置真实 Qwen ASR/TTS 的设备上完成一次真机语音验收：进入准备厅、授权麦克风、完成至少一轮问答、模拟断网恢复、降级文字并查看最终报告。
