/** HTTP 客户端封装：自动注入 Bearer Token，统一错误处理 */
import { getAccessToken } from "./auth-token";

const baseUrl = import.meta.env.VITE_API_URL || "";

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

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const err = (await res.json()) as { error?: string };
      message = err.error ?? message;
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

