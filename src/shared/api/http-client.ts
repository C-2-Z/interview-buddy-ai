/** HTTP 客户端封装：自动注入 Bearer Token，统一错误处理 */
import { getAccessToken } from "./auth-token";

const baseUrl = import.meta.env?.VITE_API_URL || "";

/** API 失败的稳定客户端错误，不保存响应正文、请求体或认证信息。 */
export class ApiRequestError extends Error {
  /**
   * @param message - 面向用户的脱敏错误文案。
   * @param status - HTTP 状态码；网络未建立连接时为 0。
   * @param code - 后端稳定错误码或 network_error。
   * @param retryable - 原请求是否适合原地重试。
   */
  constructor(message:string,public readonly status:number,public readonly code:string,public readonly retryable:boolean){super(message);this.name="ApiRequestError";}
}

/**
 * 发送带当前登录凭据的 JSON API 请求，并把失败归一为稳定客户端错误。
 *
 * @param method - HTTP 方法。
 * @param path - 不含服务端基址的 API 路径。
 * @param body - 可选 JSON 请求体。
 * @returns 已解析为调用方类型的 JSON 响应。
 */
export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res:Response;
  try{
    res=await fetch(`${baseUrl}${path}`,{method,headers,body:body?JSON.stringify(body):undefined});
  }catch{
    // 网络异常不携带浏览器原始错误，避免实现细节进入 UI 或埋点。
    throw new ApiRequestError("无法连接服务，请检查网络后重试。",0,"network_error",true);
  }

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    let code = "request_failed";
    let retryable = res.status >= 500;
    try {
      /**
       * err
       *
       * @param await res.json() -
       * @returns
       */
      const err = (await res.json()) as { error?: string;code?:string;retryable?:boolean };
      message = err.error ?? message;
      code = typeof err.code === "string" ? err.code : code;
      retryable = typeof err.retryable === "boolean" ? err.retryable : retryable;
    } catch {
      // Keep the status-based fallback.
    }
    throw new ApiRequestError(message,res.status,code,retryable);
  }

  return res.json() as Promise<T>;
}

