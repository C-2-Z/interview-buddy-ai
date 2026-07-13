/** Interview lifecycle Hook：集中管理动作忙碌态和可恢复错误。 */
import {useCallback,useState} from "react";
import {deleteInterviewSession,transitionInterviewSession} from "../api";
import type {InterviewLifecycleAction,InterviewLifecycleResult} from "../types";

/** 提供会话生命周期动作，避免页面组件直接拼装 API 请求。 */
export function useInterviewLifecycle(sessionId:string){
  const [pending,setPending]=useState<InterviewLifecycleAction|"delete"|null>(null);
  const [error,setError]=useState<string|null>(null);
  /** 执行可恢复生命周期动作并保留页面现有输入。 */
  const transition=useCallback(async(action:InterviewLifecycleAction):Promise<InterviewLifecycleResult>=>{setPending(action);setError(null);try{return await transitionInterviewSession(sessionId,action);}catch{setError("操作未完成，请重试；若问题持续存在请联系管理员。");throw new Error("lifecycle_action_failed");}finally{setPending(null);}},[sessionId]);
  /** 删除整场会话；由调用组件负责二次确认和离开页面。 */
  const remove=useCallback(async()=>{setPending("delete");setError(null);try{return await deleteInterviewSession(sessionId);}catch{setError("删除未完成，请重试或联系管理员。");throw new Error("lifecycle_delete_failed");}finally{setPending(null);}},[sessionId]);
  /** 清除已经向用户展示的动作错误。 */
  const clearError=useCallback(()=>setError(null),[]);
  return {pending,error,transition,remove,clearError};
}
