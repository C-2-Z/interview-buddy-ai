# Web、Android 与 Windows 共享前端基础架构

本文档说明跨端基础重构后的构建边界、开发命令和后续原生壳接入约定。当前仓库仍未包含 Capacitor Android 或 Tauri Windows 工程。

## 1. 架构边界

```text
共享 src/features 与 src/shared
  ├─ Web SSR：vite.config.ts → dist/client + dist/server
  └─ Native SPA：vite.native.config.ts → dist-native/client

Web、Android、Windows
  └─ HTTPS / SSE / WSS → 同一个远程 Hono API
```

Native 目录只包含公开前端代码。Hono、Supabase service role、AI Provider Key、加密密钥和数据库连接始终留在服务器。

## 2. 开发与构建命令

Web 开发保持不变：

```powershell
npm run api:dev
npm run dev
```

Web SSR 生产构建：

```powershell
npm run build
npm start
```

使用本地 HTTP API 验证 Native SPA：

```powershell
npm run build:native:dev
npm run verify:native
npm run preview:native
```

生产 Native 构建必须显式提供 HTTPS API：

```powershell
$env:VITE_API_URL = "https://api.ezmock.site"
npm run build:native
npm run verify:native
```

`preview:native` 只用于浏览器烟测，不等同于 Android WebView 或 Windows WebView2 真机验收。

## 3. 运行时配置

网络地址只能通过 `src/shared/runtime` 与 `src/shared/api` 使用，业务 feature 禁止直接读取 `VITE_API_URL`。

- Web 未配置 API 基址时使用同源路径，由 Vite/Vercel 代理处理。
- Native 必须使用绝对 API 地址。
- Native production 只接受 HTTPS，语音只接受 WSS。
- `VITE_AUTH_REDIRECT_URL` 当前可选；初始化原生壳后设置为已注册的深链回调。
- `CORS_ALLOWED_ORIGINS` 在 API 端以逗号分隔配置精确 origin，禁止 `*`。

Supabase URL 和 publishable key 是公开客户端配置；service role key 不得使用 `VITE_` 前缀。

## 4. 后续原生壳接入

### Capacitor Android

- 初始化后将 `webDir` 指向 `dist-native/client`。
- 明确配置应用 ID、深链、麦克风权限、状态栏、安全区域和返回键。
- 开发真机优先连接已部署测试 API；使用本地 API 时配置局域网地址或 `adb reverse`。
- 真机验收登录恢复、SSE、WebSocket、文件选择、PCM 采集和后台恢复。

### Tauri Windows

- 初始化后将 `frontendDist` 指向 `../dist-native/client`。
- capabilities 只开放文件选择、窗口和业务所需的最小能力。
- 配置深链、麦克风权限、WebView2、MSI/NSIS 和代码签名。
- 在纯净 Windows 环境验收安装、升级、卸载和网络恢复。

平台差异应通过 `src/shared/platform` 适配，不得把 Capacitor/Tauri 判断散落到面试、简历或知识库组件中。

## 5. 发布前检查

```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run build:native
npm run verify:native

Set-Location api-server
npx tsc --noEmit
npm test
npm run build
Set-Location ..

git diff --check
```

Native 客户端构建的服务端辅助目录只用于预渲染，原生安装包只消费 `dist-native/client`。
