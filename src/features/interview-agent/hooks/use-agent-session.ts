/** Agent 会话 Hook：鉴权 SSE、轮询降级、工作台恢复和幂等文本输入。 */
import {useCallback,useEffect,useRef,useState} from "react";
import {createAgentSession,getAgentWorkspace,interruptAgentSession,streamAgentEvents,submitAgentInput} from "../api";
import type {AgentSSEEvent,AgentSnapshot,AgentWorkspace,CreateAgentSessionBody} from "../types";

const POLL_INTERVAL_MS=3_000;
const RECONNECT_DELAY_MS=1_500;

/** Hook 对页面暴露的状态与动作。 */
export type UseAgentSessionResult={
  /** 最新持久快照。 */ snapshot:AgentSnapshot|null;
  /** 完整工作台投影。 */ workspace:AgentWorkspace|null;
  /** 请求进行中。 */ loading:boolean;
  /** 安全错误文本。 */ error:string|null;
  /** SSE 是否在线。 */ connected:boolean;
  /** 最近收到的业务事件。 */ lastEvent:AgentSSEEvent|null;
  /** 创建会话。 */ create(body:CreateAgentSessionBody):Promise<string>;
  /** 提交文本回答。 */ submitInput(content:string):Promise<void>;
  /** 打断输出。 */ interrupt():Promise<void>;
  /** 立即重新连接。 */ reconnect():void;
  /** 刷新工作台。 */ refresh():Promise<void>;
};

/** 管理一个可新建或恢复的 Agent 会话。 */
export function useAgentSession(initialSessionId?:string):UseAgentSessionResult{
  const [sessionId,setSessionId]=useState(initialSessionId);
  const [workspace,setWorkspace]=useState<AgentWorkspace|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [connected,setConnected]=useState(false);
  const [lastEvent,setLastEvent]=useState<AgentSSEEvent|null>(null);
  const cursorRef=useRef(0);const streamRef=useRef<AbortController|null>(null);const pollRef=useRef<ReturnType<typeof setInterval>|null>(null);const reconnectRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  /** 清理当前连接与降级定时器。 */
  const cleanup=useCallback(()=>{streamRef.current?.abort();streamRef.current=null;if(pollRef.current)clearInterval(pollRef.current);pollRef.current=null;if(reconnectRef.current)clearTimeout(reconnectRef.current);reconnectRef.current=null;setConnected(false);},[]);

  /** 从数据库业务投影恢复完整页面。 */
  const refresh=useCallback(async()=>{if(!sessionId)return;const next=await getAgentWorkspace(sessionId);cursorRef.current=Math.max(cursorRef.current,next.snapshot.eventCursor);setWorkspace(next);setError(null);},[sessionId]);

  /** 应用事件并在会改变题目/报告内容时刷新工作台。 */
  const applyEvent=useCallback((event:AgentSSEEvent)=>{cursorRef.current=Math.max(cursorRef.current,event.sequence);setLastEvent(event);if(event.type==="agent.snapshot")setWorkspace((current)=>current?{...current,snapshot:event.data}:current);else if(event.type==="agent.phase")setWorkspace((current)=>current?{...current,snapshot:{...current.snapshot,phase:event.data.phase}}:current);else if(event.type==="agent.activity")setWorkspace((current)=>current?{...current,activities:[...current.activities.filter((item)=>item.id!==event.data.id),event.data].slice(-20)}:current);if(["agent.question_ready","agent.message_completed","agent.score_completed","agent.session_completed"].includes(event.type)||(event.type==="agent.activity"&&event.data.status!=="running"))void refresh();},[refresh]);

  /** 建立带 Authorization 的 SSE，并在失败时启用轮询。 */
  const connect=useCallback((sid:string)=>{cleanup();const controller=new AbortController();streamRef.current=controller;void streamAgentEvents(sid,cursorRef.current,controller.signal,()=>setConnected(true),(event)=>{applyEvent(event);}).then(()=>{if(!controller.signal.aborted)setConnected(false);}).catch(()=>{if(controller.signal.aborted)return;setConnected(false);if(!pollRef.current)pollRef.current=setInterval(()=>{void refresh();},POLL_INTERVAL_MS);reconnectRef.current=setTimeout(()=>connect(sid),RECONNECT_DELAY_MS);});},[applyEvent,cleanup,refresh]);

  useEffect(()=>{if(!sessionId)return;setLoading(true);getAgentWorkspace(sessionId).then((next)=>{setWorkspace(next);cursorRef.current=next.snapshot.eventCursor;connect(sessionId);setError(null);}).catch((reason)=>setError(reason instanceof Error?reason.message:"会话加载失败")).finally(()=>setLoading(false));return cleanup;},[sessionId,connect,cleanup]);

  const create=useCallback(async(body:CreateAgentSessionBody)=>{setLoading(true);setError(null);try{const created=await createAgentSession(body);cursorRef.current=created.eventCursor;setSessionId(created.sessionId);return created.sessionId;}catch(reason){setError(reason instanceof Error?reason.message:"创建面试失败");throw reason;}finally{setLoading(false);}},[]);

  const submitInput=useCallback(async(content:string)=>{if(!sessionId)return;setLoading(true);setError(null);try{const result=await submitAgentInput(sessionId,{inputId:crypto.randomUUID(),type:"text",content});setWorkspace((current)=>current?{...current,snapshot:result.snapshot}:current);await refresh();}catch(reason){setError(reason instanceof Error?reason.message:"提交回答失败");throw reason;}finally{setLoading(false);}},[sessionId,refresh]);

  const interrupt=useCallback(async()=>{if(sessionId)await interruptAgentSession(sessionId);},[sessionId]);
  const reconnect=useCallback(()=>{if(sessionId)connect(sessionId);},[sessionId,connect]);
  return{snapshot:workspace?.snapshot??null,workspace,loading,error,connected,lastEvent,create,submitInput,interrupt,reconnect,refresh};
}
