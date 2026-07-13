/** Agent Canonical API、鉴权 SSE 和语音升级客户端。 */
import { apiRequest } from "@/shared/api/http-client";
import { getAccessToken } from "@/shared/api/auth-token";
import type {AgentInputBody,AgentSSEEvent,AgentSessionView,AgentWorkspace,CreateAgentSessionBody,CreateAgentSessionResponse} from "./types";

const API_BASE=import.meta.env.VITE_API_URL||"";

/** 创建 Agent 会话。 */
export function createAgentSession(body:CreateAgentSessionBody):Promise<CreateAgentSessionResponse>{return apiRequest("POST","/api/agent/sessions",body);}
/** 读取最新快照。 */
export function getAgentSession(sessionId:string):Promise<AgentSessionView>{return apiRequest("GET",`/api/agent/sessions/${sessionId}`);}
/** 读取页面恢复投影。 */
export function getAgentWorkspace(sessionId:string):Promise<AgentWorkspace>{return apiRequest("GET",`/api/agent/sessions/${sessionId}/workspace`);}
/** 提交文本回答。 */
export function submitAgentInput(sessionId:string,input:AgentInputBody):Promise<{duplicate:boolean;snapshot:import("./types").AgentSnapshot}>{return apiRequest("POST",`/api/agent/sessions/${sessionId}/input`,input);}
/** 打断当前输出。 */
export function interruptAgentSession(sessionId:string):Promise<{accepted:boolean}>{return apiRequest("POST",`/api/agent/sessions/${sessionId}/interrupt`,{});}
/** 重试失败准备。 */
export function retryAgentSession(sessionId:string):Promise<{duplicate:boolean;snapshot:import("./types").AgentSnapshot}>{return apiRequest("POST",`/api/agent/sessions/${sessionId}/retry`,{});}
/** 获取语音 WebSocket URL。 */
export function connectAgentVoice(sessionId:string):Promise<{wsUrl:string;expiresAt:string}>{return apiRequest("POST",`/api/agent/sessions/${sessionId}/voice/connect`,{});}

/** 解析一个 SSE data 块。 */
function parseSseBlock(block:string):AgentSSEEvent|null{
  const data=block.split(/\r?\n/).filter((line)=>line.startsWith("data:")).map((line)=>line.slice(5).trimStart()).join("\n");
  if(!data||data==="{}")return null;
  try{return JSON.parse(data) as AgentSSEEvent;}catch{return null;}
}

/**
 * 使用带 Bearer Header 的 fetch 流读取 SSE；原生 EventSource 无法携带 Supabase token。
 *
 * @param sessionId - 需要订阅的面试会话 UUID。
 * @param lastEventId - 客户端已经应用的最后事件序号。
 * @param signal - 页面卸载或主动重连时中止长连接的信号。
 * @param onOpen - 服务端响应头和可读流就绪后的回调。
 * @param onEvent - 每个完整业务事件的消费回调。
 * @returns 事件流关闭或被中止时解决。
 */
export async function streamAgentEvents(
  sessionId:string,
  lastEventId:number,
  signal:AbortSignal,
  onOpen:()=>void,
  onEvent:(event:AgentSSEEvent)=>void,
):Promise<void>{
  const token=await getAccessToken();
  const response=await fetch(`${API_BASE}/api/agent/sessions/${sessionId}/events`,{headers:{Accept:"text/event-stream",...(token?{Authorization:`Bearer ${token}`}:{ }),...(lastEventId>0?{"Last-Event-ID":String(lastEventId)}:{})},signal});
  if(!response.ok||!response.body)throw new Error(`事件流连接失败 (${response.status})`);
  // 无新业务事件时服务端只发送心跳，因此响应流就绪即代表连接成功。
  onOpen();
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="";
  while(!signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop()??"";for(const block of blocks){const event=parseSseBlock(block);if(event)onEvent(event);}}
}
