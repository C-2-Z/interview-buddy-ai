/** Agent 创建失败恢复 Hook：保存脱敏失败状态，不保存表单正文。 */
import {useCallback,useState} from "react";
import {normalizeAgentCreateFailure} from "../api";
import type {AgentCreateFailure} from "../types";

/**
 * 管理最近一次创建失败及其清理动作。
 *
 * @returns 脱敏失败状态，以及捕获和清理动作。
 */
export function useAgentCreateRecovery(){
  const [failure,setFailure]=useState<AgentCreateFailure|null>(null);
  /** 捕获未知异常并只保留稳定恢复协议。 */
  const capture=useCallback((error:unknown)=>setFailure(normalizeAgentCreateFailure(error)),[]);
  /** 新尝试开始或配置变化后清除旧错误。 */
  const clear=useCallback(()=>setFailure(null),[]);
  return {failure,capture,clear};
}
