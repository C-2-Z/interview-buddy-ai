/** 跨端运行时配置：统一 Web SSR 与 Native WebView 的公开环境和地址规则。 */

/** 前端构建产物的运行目标。 */
export type AppTarget = "web" | "native";

/** 构建系统向运行时配置提供的公开变量。 */
export type RuntimeConfigInput = Readonly<{
  /** 当前构建目标。 */
  target?: string;
  /** 是否为生产构建。 */
  production?: boolean;
  /** 独立 Hono API 的公开基址。 */
  apiBaseUrl?: string;
  /** Supabase 项目公开地址。 */
  supabaseUrl?: string;
  /** Supabase 浏览器可公开的 publishable key。 */
  supabasePublishableKey?: string;
  /** 邮件认证完成后的可选显式回调地址。 */
  authRedirectUrl?: string;
  /** 密码恢复邮件完成后的可选显式回调地址。 */
  passwordRecoveryRedirectUrl?: string;
}>;

/** 经过规范化、可供业务基础设施消费的运行时配置。 */
export type RuntimeConfig = Readonly<{
  /** 当前构建目标。 */
  target: AppTarget;
  /** 是否启用生产安全约束。 */
  production: boolean;
  /** 无尾部斜杠的 API 基址；Web 同源模式允许为空。 */
  apiBaseUrl: string;
  /** Supabase 项目公开地址。 */
  supabaseUrl: string;
  /** Supabase publishable key。 */
  supabasePublishableKey: string;
  /** 邮件认证完成后的可选回调地址。 */
  authRedirectUrl: string;
  /** 密码恢复邮件完成后的可选回调地址。 */
  passwordRecoveryRedirectUrl: string;
}>;

/** 去掉地址尾部斜杠，避免基础地址与 API path 拼接出重复分隔符。 */
function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** 验证 API 基址使用浏览器和 WebView 都支持的 HTTP 协议。 */
function assertHttpBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_URL 必须是绝对 HTTP(S) 地址");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("VITE_API_URL 只允许 http 或 https 协议");
  }
  return url;
}

/**
 * 规范化公开运行时配置，并在 Native 构建阶段阻止不可发布的网络地址。
 *
 * @param input - Vite 或测试注入的公开配置。
 * @returns 可直接用于网络、认证与平台选择的稳定配置。
 */
export function resolveRuntimeConfig(input: RuntimeConfigInput): RuntimeConfig {
  const target: AppTarget = input.target === "native" ? "native" : "web";
  const production = input.production === true;
  const apiBaseUrl = trimTrailingSlash(input.apiBaseUrl ?? "");

  if (apiBaseUrl) {
    const apiUrl = assertHttpBaseUrl(apiBaseUrl);
    if (target === "native" && production && apiUrl.protocol !== "https:") {
      throw new Error("Native 生产构建必须使用 HTTPS API 地址");
    }
  } else if (target === "native") {
    throw new Error("Native 构建必须配置 VITE_API_URL");
  }

  return {
    target,
    production,
    apiBaseUrl,
    supabaseUrl: trimTrailingSlash(input.supabaseUrl ?? ""),
    supabasePublishableKey: input.supabasePublishableKey?.trim() ?? "",
    authRedirectUrl: trimTrailingSlash(input.authRedirectUrl ?? ""),
    passwordRecoveryRedirectUrl: trimTrailingSlash(input.passwordRecoveryRedirectUrl ?? ""),
  };
}

/**
 * 把 API path 解析为当前目标可访问的 HTTP 地址。
 *
 * @param config - 已规范化的运行时配置。
 * @param path - `/api` 开头的路径或完整 HTTP(S) 地址。
 * @returns Web 同源路径或包含远端基址的绝对地址。
 */
export function resolveApiUrl(config: RuntimeConfig, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${config.apiBaseUrl}${normalizedPath}`;
}

/**
 * 将服务端签发或本地构造的语音地址统一转换为 WebSocket 协议。
 *
 * @param config - 已规范化的运行时配置。
 * @param value - WS、HTTP 或相对地址。
 * @param currentOrigin - Web 同源模式解析相对地址时使用的页面 origin。
 * @returns 只使用 ws/wss 协议的绝对地址。
 */
export function resolveWebSocketUrl(
  config: RuntimeConfig,
  value: string,
  currentOrigin?: string,
): string {
  const base = config.apiBaseUrl || currentOrigin;
  let url: URL;
  try {
    url = base ? new URL(value, base) : new URL(value);
  } catch {
    throw new Error("语音 WebSocket 地址无效");
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("语音连接只允许 ws 或 wss 协议");
  }
  if (config.production && url.protocol !== "wss:") {
    throw new Error("生产环境语音连接必须使用 WSS");
  }
  return url.toString();
}

const viteEnv = import.meta.env;
/** 当前构建产物的单例公开运行时配置。 */
export const runtimeConfig = resolveRuntimeConfig({
  target: viteEnv?.VITE_APP_TARGET,
  production: String(viteEnv?.VITE_APP_PRODUCTION) === "true",
  apiBaseUrl: viteEnv?.VITE_API_URL ?? "",
  supabaseUrl:
    viteEnv?.VITE_SUPABASE_URL ??
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined),
  supabasePublishableKey:
    viteEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ??
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined),
  authRedirectUrl: viteEnv?.VITE_AUTH_REDIRECT_URL,
  passwordRecoveryRedirectUrl: viteEnv?.VITE_PASSWORD_RECOVERY_REDIRECT_URL,
});

/** 返回当前 API origin；同源 Web 模式没有独立 origin。 */
export function getApiOrigin(): string | null {
  return runtimeConfig.apiBaseUrl ? new URL(runtimeConfig.apiBaseUrl).origin : null;
}

/** 返回认证邮件回调地址，未显式配置时保持原有页面 origin 行为。 */
export function getAuthRedirectUrl(currentOrigin: string): string {
  return runtimeConfig.authRedirectUrl || currentOrigin;
}

/**
 * 为指定运行目标生成密码恢复回跳地址。
 *
 * @param config - 当前构建目标的运行时配置。
 * @param currentOrigin - Web 页面当前 origin。
 * @returns Web 路由或 Native 自定义协议地址。
 */
export function resolvePasswordRecoveryRedirectUrl(
  config: RuntimeConfig,
  currentOrigin: string,
): string {
  if (config.passwordRecoveryRedirectUrl) return config.passwordRecoveryRedirectUrl;
  return config.target === "native"
    ? "interviewbuddy://auth/reset-password"
    : `${trimTrailingSlash(currentOrigin)}/auth/reset-password`;
}

/**
 * 返回当前应用构建目标的密码恢复邮件回跳地址。
 *
 * @param currentOrigin - Web 页面当前 origin。
 * @returns 当前平台可处理的密码恢复地址。
 */
export function getPasswordRecoveryRedirectUrl(currentOrigin: string): string {
  return resolvePasswordRecoveryRedirectUrl(runtimeConfig, currentOrigin);
}
