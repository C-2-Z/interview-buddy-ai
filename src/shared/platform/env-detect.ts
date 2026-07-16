/** 环境检测工具：区分 Tauri WebView2 与标准浏览器。 */

/** 检查当前是否运行在 Tauri WebView2 环境中。 */
export function isTauri(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI__" in window;
  } catch {
    return false;
  }
}
