# Tauri 2 Windows 桌面端实现方案

## 概述

在当前 Web SSR 版本之外，增加一个 **Tauri 2 原生壳**，加载 SPA 构建产物 `dist-native/client`，复用全部前端 feature 代码。后端 Hono API、Supabase、AI Provider 全部保持远程，不进安装包。

## 1. 架构边界

```
Web SSR (Vercel)                    Tauri Windows
├─ vite.config.ts                   ├─ vite.native.config.ts (SPA)
│  └─ dist/client + server          │  └─ dist-native/client
└─ npm run build                    └─ npm run build:native → npm run tauri:build
                                           │
                                      src-tauri/
                                      ├─ src/main.rs       (WebView 壳)
                                      ├─ src/lib.rs        (插件注册)
                                      ├─ tauri.conf.json
                                      ├─ capabilities/
                                      ├─ icons/
                                      └─ Cargo.toml
                                           │
                                 System WebView2 (已安装)
                                           │
                                 └─ HTTPS/WSS → 同远端 Hono API
```

**关键原则**：

- `dist-native/client` 只包含公开前端代码
- Tauri 安装包不含任何服务端密钥
- Web 和 Tauri 共享 `src/features`、`src/components`、`src/shared`
- 平台差异通过 `platform-adapter.ts` 适配，不在业务代码中写 `if Tauri`

## 2. 新增/修改文件清单

### 新增文件

| 文件                                   | 职责                                        |
| -------------------------------------- | ------------------------------------------- |
| `src-tauri/Cargo.toml`                 | Tauri 2 Rust 项目配置                       |
| `src-tauri/src/main.rs`                | Rust 入口，创建单窗口 WebView 实例          |
| `src-tauri/src/lib.rs`                 | 可选的库入口（插件注册）                    |
| `src-tauri/tauri.conf.json`            | 窗口、构建、bundle、capabilities 等核心配置 |
| `src-tauri/capabilities/default.json`  | 默认权限声明（麦克风、文件、深链）          |
| `src-tauri/icons/`                     | 应用图标文件（.ico, .png）                  |
| `src-tauri/build.rs`                   | Tauri 构建脚本                              |
| `src/shared/platform/tauri-adapter.ts` | Tauri 平台适配器实现                        |
| `src/features/tauri-deep-link/`        | 深链监听模块（auth callback 预留）          |

### 修改文件

| 文件                                      | 变更内容                                               |
| ----------------------------------------- | ------------------------------------------------------ |
| `package.json`                            | 增加 `tauri:dev`、`tauri:build`、`tauri:icon` 脚本     |
| `.gitignore`                              | 增加 `src-tauri/target/`                               |
| `src/shared/platform/platform-adapter.ts` | 新增 `isTauri()` 检测和 `createTauriPlatformAdapter()` |
| `src/integrations/supabase/client.ts`     | Tauri 环境下使用 `flowType: "pkce"`                    |
| `docs/跨端基础架构.md`                    | 更新 Windows 端的实际配置                              |

## 3. 逐模块实现细节

### 3.1 `tauri.conf.json` 核心配置

- **`build.frontendDist`** — `"../dist-native/client"`（相对 `src-tauri/`）
- **`build.devUrl`** — `"http://localhost:5173"`（开发时指向 Vite dev server）
- **`build.beforeBuildCommand`** — `"npm run build:native"`
- **`build.beforeDevCommand`** — `"npm run dev"`
- **窗口** — 默认 1200×800，最小 900×600，可缩放
- **CSP** — 严格但允许连接部署的 API 和 Supabase
- **bundle** — 目标 `msi`，语言 `zh-CN`
- **identifier** — `com.ezmock.interview-buddy`

### 3.2 `capabilities/default.json`

```json
{
  "identifier": "default",
  "description": "默认权限：麦克风、文件选择、窗口操作",
  "windows": ["main"],
  "permissions": ["core:default", "microphone:default", "dialog:default", "shell:allow-open"]
}
```

### 3.3 Tauri 平台适配器 (`src/shared/platform/tauri-adapter.ts`)

当前 `platform-adapter.ts` 只有 `createWebPlatformAdapter()`。新增 Tauri 版本：

**差异点**：

- `isSecureContext` → 始终返回 `false`（file:// 不是 secure context）
- `getCurrentOrigin` → 开发 `http://localhost:5173`，生产 `tauri://localhost`
- WebSocket → 与 Web 版一致
- 全屏 → WebView2 Fullscreen API 可用
- WakeLock → Tauri 2 不支持 Web WakeLock API，返回 null

### 3.4 Supabase Auth 处理

**当前**：使用邮箱密码直接登录 (`signInWithPassword`)，WebView2 中 API 调用直接正常工作。
**调整**：Tauri 下 Supabase 客户端需要使用 `flowType: "pkce"`。
**不需要深链**的场景：邮箱密码登录/注册，session 持久化到 localStorage 即可。
**深链预留**的场景：未来 OAuth 登录、密码重置回调。

### 3.5 构建命令

```json
{
  "scripts": {
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:icon": "tauri icon public/favicon.svg"
  }
}
```

**开发流程**：`npm run api:dev`（终端1）+ `npm run tauri:dev`（终端2）。
**生产构建**：`npm run tauri:build`（自动先执行 `npm run build:native`）。

## 4. 12 步实施顺序

### Step 1 — 环境准备

检查 Rust 和 WebView2：

```powershell
rustc --version
cargo --version
```

未安装 Rust：`winget install Rust.Rustup`

### Step 2 — 安装 Tauri CLI

```powershell
cargo install tauri-cli --version "^2"
```

### Step 3 — 预验证 Native SPA 构建

```powershell
npm run build:native:dev
npm run verify:native
```

### Step 4 — 初始化 Tauri 项目

```powershell
cd D:\26AICoding\interview-buddy-ai
npx tauri init
```

参数：应用名 `EZMock AI面试模拟器`，窗口标题同，dev URL `http://localhost:5173`，
构建命令 `npm run build:native`，产物目录 `../dist-native/client`，dev 命令 `npm run dev`。

### Step 5 — 配置 `tauri.conf.json`

编辑窗口大小、CSP、bundle、identifier。

### Step 6 — 编辑 `capabilities/default.json`

添加 microphone / dialog / shell 权限。

### Step 7 — 图标准备

`npx tauri icon <logo-path>` 生成各种尺寸图标。

### Step 8 — 实现 Tauri 平台适配器

创建 `src/shared/platform/tauri-adapter.ts`。

### Step 9 — 更新 `platform-adapter.ts`

添加 Tauri 环境检测和适配器自动选择。

### Step 10 — 更新 Supabase 客户端

判断 Tauri 环境切换 PKCE flow。

### Step 11 — 更新构建脚本 & .gitignore

新增 tauri 脚本，忽略 `src-tauri/target/`。

### Step 12 — 创建深链预留模块骨架

types + api + hook + component 占位。

## 5. 验收清单

| 测试项                  | 预期                  |
| ----------------------- | --------------------- |
| 应用图标和窗口标题      | "EZMock AI面试模拟器" |
| 邮箱登录 → Hub 页       | 成功，跳转正确        |
| 登录后刷新              | session 保持          |
| 创建文本面试            | 全流程通过            |
| 麦克风权限弹窗          | Windows 系统弹窗      |
| 语音面试录音            | 音频采集正常          |
| 文件上传（简历/知识库） | 选择对话框正常        |
| 窗口缩放 / 最大化       | 正常，内容不截断      |
| MSI 安装包              | < 10 MB               |
| 纯净 Windows 安装       | 正常                  |

## 6. 风险 & 缓解

| 风险                                | 等级 | 对策                      |
| ----------------------------------- | ---- | ------------------------- |
| getUserMedia 音频格式与 Qwen 不匹配 | P1   | 验证前端 PCM 采样率转换   |
| file:// 非 secure context 限制 API  | P1   | Tauri capability 声明绕过 |
| Supabase autoRefreshToken 跨域失败  | P1   | CSP 允许 supabase.co      |
| 中文字体渲染                        | P2   | WebView2 内置微软雅黑     |
| MSI 代码签名                        | P2   | 初次可跳过，发布前购买    |

## 7. 假设 & 默认决策

- 邮箱密码登录 **不需要深链回调**，WebView2 中直接工作
- 通过 `window.__TAURI__` 检测平台
- 初次只生成 MSI 安装包，不包含 NSIS
- 应用 ID: `com.ezmock.interview-buddy`
- TanStack Router SPA mode 通过 Tauri 的 asset protocol scope 确保路由生效
