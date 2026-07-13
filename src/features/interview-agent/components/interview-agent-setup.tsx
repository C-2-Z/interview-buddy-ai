/** Agent 新建页：冻结角色模式、交互通道、岗位、题量、模型与研究选项。 */
import {useState} from "react";
import {Globe,Keyboard,Loader2,Mic2,Users} from "lucide-react";
import {useNavigate} from "@tanstack/react-router";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Switch} from "@/components/ui/switch";
import {Textarea} from "@/components/ui/textarea";
import {useAgentSession} from "../hooks/use-agent-session";
import type {AgentMode,CreateAgentSessionBody} from "../types";
import {AgentReadinessStatus} from "@/features/agent-readiness/components/agent-readiness-status";
import {useAgentReadiness} from "@/features/agent-readiness/hooks/use-agent-readiness";
import type {ReadinessRecoveryAction} from "@/features/agent-readiness/types";
import {AgentCreateError} from "@/features/agent-create-recovery/components/agent-create-error";
import {useAgentCreateRecovery} from "@/features/agent-create-recovery/hooks/use-agent-create-recovery";
import type {AgentCreateRecoveryAction} from "@/features/agent-create-recovery/types";

/** 表单草稿。 */
type SetupDraft={mode:AgentMode;interviewMode:"text"|"voice";position:string;difficulty:"初级"|"中级"|"高级";questionCount:number;targetCompany:string;jobDescription:string;modelProvider:"deepseek"|"openai"|"anthropic";webResearch:boolean};
const INITIAL_DRAFT:SetupDraft={mode:"single",interviewMode:"text",position:"",difficulty:"中级",questionCount:5,targetCompany:"",jobDescription:"",modelProvider:"deepseek",webResearch:true};

/** Agent 面试配置页面。 */
export function InterviewAgentSetupPage({initialResumeId}:{/** 从简历详情进入时冻结的简历 UUID。 */initialResumeId?:string}){
  const navigate=useNavigate();const session=useAgentSession();const [draft,setDraft]=useState(INITIAL_DRAFT);
  const readiness=useAgentReadiness({interviewMode:draft.interviewMode,modelProvider:draft.modelProvider,webResearch:draft.webResearch});
  const createRecovery=useAgentCreateRecovery();
  const patch=(value:Partial<SetupDraft>)=>setDraft((current)=>({...current,...value}));
  /** 将后端固定恢复动作映射为页面内安全操作。 */
  function recover(action:ReadinessRecoveryAction){if(action==="open_settings")void navigate({to:"/settings"});else if(action==="use_text")patch({interviewMode:"text"});else if(action==="disable_research")patch({webResearch:false});else if(action==="retry")void readiness.refetch();else window.location.href="mailto:support@ezmock.site?subject=模拟面试服务支持";}
  /** 使用当前受控草稿创建唯一 Agent 会话，失败时不清空任何字段。 */
  async function createFromDraft(){if(!readiness.data||readiness.data.status==="blocked"||readiness.isFetching)return;createRecovery.clear();const body:CreateAgentSessionBody={mode:draft.mode,interviewMode:draft.interviewMode,position:draft.position.trim(),difficulty:draft.difficulty,questionCount:draft.questionCount,targetCompany:draft.targetCompany.trim()||undefined,jobDescription:draft.jobDescription.trim()||undefined,resumeId:initialResumeId,modelProvider:draft.modelProvider,webResearch:draft.webResearch};try{const sessionId=await session.create(body);await navigate({to:"/session/$id",params:{id:sessionId}});}catch(error){createRecovery.capture(error);}}
  /** 阻止浏览器默认提交，并复用可原地重试的创建流程。 */
  async function submit(event:React.FormEvent){event.preventDefault();await createFromDraft();}
  /** 执行创建失败协议中的页面动作。 */
  function recoverCreate(action:AgentCreateRecoveryAction){if(action==="retry_create")void createFromDraft();else if(action==="open_settings")void navigate({to:"/settings"});else if(action==="recheck")void readiness.refetch();else window.location.href="mailto:support@ezmock.site?subject=模拟面试创建失败";}
  return <div className="mx-auto max-w-3xl space-y-6"><header><h1 className="text-3xl font-bold tracking-tight">创建模拟面试</h1><p className="mt-2 text-sm text-muted-foreground">填写训练目标，系统会在开始前检查模型、恢复和交互能力。</p></header>
    <AgentReadinessStatus readiness={readiness.data} checking={readiness.isFetching} error={readiness.isError} onAction={recover}/>
    {createRecovery.failure&&<AgentCreateError failure={createRecovery.failure} retrying={session.loading} onAction={recoverCreate}/>}
    <form onSubmit={submit}><Card><CardHeader><CardTitle>面试配置</CardTitle><CardDescription>文本和语音使用同一套面试计划与进度记录。{initialResumeId?" 已绑定当前简历。":""}</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="space-y-2"><Label htmlFor="position">目标岗位</Label><Input id="position" value={draft.position} onChange={(event)=>patch({position:event.target.value})} placeholder="例如：Java 后端工程师" maxLength={100} required/></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>角色模式</Label><div className="grid grid-cols-2 gap-2"><Button type="button" variant={draft.mode==="single"?"default":"outline"} onClick={()=>patch({mode:"single"})}><Users/>单面试官</Button><Button type="button" variant={draft.mode==="panel"?"default":"outline"} onClick={()=>patch({mode:"panel"})}><Users/>技术·主管·HR</Button></div></div><div className="space-y-2"><Label>交互通道</Label><div className="grid grid-cols-2 gap-2"><Button type="button" variant={draft.interviewMode==="text"?"default":"outline"} onClick={()=>patch({interviewMode:"text"})}><Keyboard/>文本</Button><Button type="button" variant={draft.interviewMode==="voice"?"default":"outline"} onClick={()=>patch({interviewMode:"voice"})}><Mic2/>语音</Button></div></div></div>
      <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>难度</Label><Select value={draft.difficulty} onValueChange={(value)=>patch({difficulty:value as SetupDraft["difficulty"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="初级">初级</SelectItem><SelectItem value="中级">中级</SelectItem><SelectItem value="高级">高级</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>题目数量</Label><Select value={String(draft.questionCount)} onValueChange={(value)=>patch({questionCount:Number(value)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:8},(_,index)=>index+3).map((count)=><SelectItem key={count} value={String(count)}>{count} 题</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>模型</Label><Select value={draft.modelProvider} onValueChange={(value)=>patch({modelProvider:value as SetupDraft["modelProvider"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="deepseek">DeepSeek</SelectItem><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent></Select></div></div>
      <div className="space-y-2"><Label htmlFor="company">目标公司（选填）</Label><Input id="company" value={draft.targetCompany} onChange={(event)=>patch({targetCompany:event.target.value})} maxLength={100}/></div>
      <div className="space-y-2"><Label htmlFor="jd">岗位需求描述（选填）</Label><Textarea id="jd" value={draft.jobDescription} onChange={(event)=>patch({jobDescription:event.target.value})} maxLength={2000} className="min-h-28"/></div>
      <div className="flex items-center justify-between rounded-xl border p-4"><div className="flex gap-3"><Globe className="size-5 text-muted-foreground"/><div><div className="text-sm font-medium">准备阶段联网研究</div><div className="text-xs text-muted-foreground">只读取公司、岗位与行业来源；网页内容不会成为指令。</div></div></div><Switch checked={draft.webResearch} onCheckedChange={(value)=>patch({webResearch:value})}/></div>
      <Button type="submit" className="min-h-11 w-full" disabled={session.loading||readiness.isFetching||!readiness.data||readiness.data.status==="blocked"||!draft.position.trim()}>{session.loading?<><Loader2 className="animate-spin"/>正在准备面试</>:readiness.data?.status==="blocked"?"完成设置后即可开始":"创建并开始面试"}</Button>
    </CardContent></Card></form>
  </div>;
}
