/** 统一 API 传输层：为 JSON、上传和流式请求注入地址、Token 与稳定错误。 */
import { runtimeConfig, resolveApiUrl, type RuntimeConfig } from "@/shared/runtime/runtime-config";
import { getAccessToken } from "./auth-token";

/** API 失败的稳定客户端错误，不保存响应正文、请求体或认证信息。 */
export class ApiRequestError extends Error {
  /**
   * @param message - 面向用户的脱敏错误文案。
   * @param status - HTTP 状态码；网络未建立连接时为 0。
   * @param code - 后端稳定错误码或 network_error。
   * @param retryable - 原请求是否适合原地重试。
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** 创建传输层所需的可替换依赖，测试和未来 Native 容器可安全注入实现。 */
export type ApiTransportDependencies = Readonly<{
  /** 返回当前运行时配置。 */
  getConfig: () => RuntimeConfig;
  /** 返回当前 Supabase access token。 */
  getToken: () => Promise<string | null>;
  /** 实际执行网络请求。 */
  fetch: typeof globalThis.fetch;
}>;

/** 统一 API 传输层公开契约。 */
export type ApiTransport = Readonly<{
  /** 发送任意已鉴权请求并保留原始 Response。 */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** 发送 JSON 请求并解析 JSON 响应。 */
  request: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  /** 上传 FormData 并解析 JSON 响应。 */
  upload: <T>(path: string, body: FormData, init?: RequestInit) => Promise<T>;
}>;

/** 从失败响应中读取后端稳定错误，无法解析时回退到状态码。 */
async function toApiError(response: Response): Promise<ApiRequestError> {
  let message = `请求失败 (${response.status})`;
  let code = "request_failed";
  let retryable = response.status >= 500;
  try {
    const body = (await response.json()) as {
      /** 面向用户的错误说明。 */ error?: string;
      /** 稳定错误码。 */ code?: string;
      /** 是否可安全重试。 */ retryable?: boolean;
    };
    message = body.error ?? message;
    code = typeof body.code === "string" ? body.code : code;
    retryable = typeof body.retryable === "boolean" ? body.retryable : retryable;
  } catch {
    // 非 JSON 错误响应继续使用状态码回退，避免将原始正文暴露到 UI。
  }
  return new ApiRequestError(message, response.status, code, retryable);
}

/**
 * 创建统一传输层；依赖注入使 URL、Token、上传和 SSE 行为可独立测试。
 *
 * @param dependencies - 当前运行时的配置、Token 与 fetch 实现。
 * @returns JSON、上传和原始流式请求共用的客户端。
 */
export function createApiTransport(dependencies: ApiTransportDependencies): ApiTransport {
  /** 注入 Bearer Token 并把网络及 HTTP 失败统一为 ApiRequestError。 */
  async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await dependencies.getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await dependencies.fetch(resolveApiUrl(dependencies.getConfig(), path), {
        ...init,
        headers,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiRequestError("无法连接服务，请检查网络后重试。", 0, "network_error", true);
    }
    if (!response.ok) throw await toApiError(response);
    return response;
  }

  return {
    fetch: authorizedFetch,
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const headers = new Headers({ "Content-Type": "application/json" });
      const response = await authorizedFetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return response.json() as Promise<T>;
    },
    async upload<T>(path: string, body: FormData, init: RequestInit = {}): Promise<T> {
      // 浏览器必须自行生成 multipart boundary，因此这里不能设置 Content-Type。
      const response = await authorizedFetch(path, {
        ...init,
        method: init.method ?? "POST",
        body,
      });
      return response.json() as Promise<T>;
    },
  };
}

const apiTransport = createApiTransport({
  getConfig: () => runtimeConfig,
  getToken: getAccessToken,
  fetch: (...args) => globalThis.fetch(...args),
});

/** 发送任意带当前登录凭据的 API 请求，并返回原始响应。 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return apiTransport.fetch(path, init);
}

/** 保持现有 feature 调用签名的 JSON API 请求。 */
export function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return apiTransport.request<T>(method, path, body);
}

/** 上传 FormData；自动注入 Token，但不覆盖 multipart boundary。 */
export function apiUpload<T>(path: string, body: FormData, init?: RequestInit): Promise<T> {
  return apiTransport.upload<T>(path, body, init);
}
