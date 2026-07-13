/** Agent 创建向导：以训练目标和执行方案两步完成配置、预检与草稿恢复。 */
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,CheckCircle2,Globe,Keyboard,Loader2,Mic2,Users} from "lucide-react";
import {useNavigate} from "@tanstack/react-router";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Switch} from "@/components/ui/switch";
import {Textarea} from "@/components/ui/textarea";
import {AgentReadinessStatus} from "@/features/agent-readiness/components/agent-readiness-status";
import {useAgentReadiness} from "@/features/agent-readiness/hooks/use-agent-readiness";
import type {ReadinessRecoveryAction} from "@/features/agent-readiness/types";
import {AgentCreateError} from "@/features/agent-create-recovery/components/agent-create-error";
import {useAgentCreateRecovery} from "@/features/agent-create-recovery/hooks/use-agent-create-recovery";
import type {AgentCreateRecoveryAction} from "@/features/agent-create-recovery/types";
import {useAgentSession} from "../hooks/use-agent-session";
import type {AgentMode,CreateAgentSessionBody} from "../types";

/** 创建向导受控草稿。 */
type SetupDraft={
  /** 单角色或面板。 */mode:AgentMode;
  /** 文本或语音通道。 */interviewMode:"text"|"voice";
  /** 用户要训练的目标岗位。 */position:string;
  /** 训练难度。 */difficulty:"初级"|"中级"|"高级";
  /** 计划题量。 */questionCount:number;
  /** 可选目标公司。 */targetCompany:string;
  /** 可选岗位需求。 */jobDescription:string;
  /** 用户选择的模型供应商。 */modelProvider:"deepseek"|"openai"|"anthropic";
  /** 是否启用准备阶段联网研究。 */webResearch:boolean;
};

const INITIAL_DRAFT:SetupDraft={mode:"single",interviewMode:"text",position:"",difficulty:"中级",questionCount:5,targetCompany:"",jobDescription:"",modelProvider:"deepseek",webResearch:true};
const DRAFT_KEY="ezmock:create-wizard-draft:v1";

/** 从本地恢复经过最小结构校验的创建草稿，异常数据直接回退安全默认值。 */
function loadDraft():SetupDraft{
  if(typeof window==="undefined")return INITIAL_DRAFT;
  try{
    const parsed=JSON.parse(window.localStorage.getItem(DRAFT_KEY)??"null") as Partial<SetupDraft>|null;
    if(!parsed||typeof parsed.position!=="string")return INITIAL_DRAFT;
    return {...INITIAL_DRAFT,...parsed};
  }catch{return INITIAL_DRAFT;}
}

/** Agent 面试两步创建向导；第一步确认目标，第二步预览计划并执行 readiness。 */
export function InterviewAgentSetupPage({initialResumeId}:{/** 从简历详情进入时冻结的简历 UUID。 */initialResumeId?:string}){
  const navigate=useNavigate();const session=useAgentSession();const [draft,setDraft]=useState(loadDraft);const [step,setStep]=useState<1|2>(1);
  const readiness=useAgentReadiness({interviewMode:draft.interviewMode,modelProvider:draft.modelProvider,webResearch:draft.webResearch});
  const createRecovery=useAgentCreateRecovery();
  /** 合并受控字段，确保后续失败不会重置用户输入。 */
  function patch(value:Partial<SetupDraft>){setDraft((current)=>({...current,...value}));}
  // 长表单自动保存，刷新、回退和创建失败后仍可继续。
  useEffect(()=>{window.localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));},[draft]);

  /** 将 readiness 恢复动作映射为页面内操作或明确导航。 */
  function recover(action:ReadinessRecoveryAction){if(action==="open_settings")void navigate({to:"/settings"});else if(action==="use_text")patch({interviewMode:"text"});else if(action==="disable_research")patch({webResearch:false});else if(action==="retry")void readiness.refetch();else window.location.href="mailto:support@ezmock.site?subject=模拟面试服务支持";}

  /** 使用当前受控草稿创建唯一 Agent 会话，成功后才清理本地草稿。 */
  async function createFromDraft(){
    if(!readiness.data||readiness.data.status==="blocked"||readiness.isFetching)return;
    createRecovery.clear();
    const body:CreateAgentSessionBody={mode:draft.mode,interviewMode:draft.interviewMode,position:draft.position.trim(),difficulty:draft.difficulty,questionCount:draft.questionCount,targetCompany:draft.targetCompany.trim()||undefined,jobDescription:draft.jobDescription.trim()||undefined,resumeId:initialResumeId,modelProvider:draft.modelProvider,webResearch:draft.webResearch};
    try{const sessionId=await session.create(body);window.localStorage.removeItem(DRAFT_KEY);await navigate({to:"/session/$id",params:{id:sessionId}});}catch(error){createRecovery.capture(error);}
  }

  /** 阻止浏览器默认提交并复用保留草稿的创建流程。 */
  async function submit(event:React.FormEvent){event.preventDefault();await createFromDraft();}

  /** 执行创建失败协议中的页面动作。 */
  function recoverCreate(action:AgentCreateRecoveryAction){if(action==="retry_create")void createFromDraft();else if(action==="open_settings")void navigate({to:"/settings"});else if(action==="recheck")void readiness.refetch();else window.location.href="mailto:support@ezmock.site?subject=模拟面试创建失败";}

  const goalReady=Boolean(draft.position.trim());
  return <div className="mx-auto max-w-4xl space-y-6">
    <header><h1 className="text-3xl font-bold tracking-tight">创建模拟面试</h1><p className="mt-2 text-sm text-muted-foreground">先明确训练目标，再确认系统生成的执行方案。草稿会自动保留。</p></header>
    <ol aria-label="创建进度" className="grid grid-cols-2 gap-3">
      <li className={`rounded-xl border p-4 ${step===1?"border-primary bg-primary/5":""}`}><span className="text-xs text-muted-foreground">步骤 1 / 2</span><div className="font-medium">训练目标</div></li>
      <li className={`rounded-xl border p-4 ${step===2?"border-primary bg-primary/5":""}`}><span className="text-xs text-muted-foreground">步骤 2 / 2</span><div className="font-medium">方案与预检</div></li>
    </ol>
    <form onSubmit={submit}>
      {step===1?<Card><CardHeader><CardTitle>你想练什么</CardTitle><CardDescription>这些信息决定题目方向；可选内容留空也能开始。</CardDescription></CardHeader><CardContent className="space-y-6">
        <div className="space-y-2"><Label htmlFor="position">目标岗位 *</Label><Input id="position" value={draft.position} onChange={(event)=>patch({position:event.target.value})} placeholder="例如：Java 后端工程师" maxLength={100} required/></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="company">目标公司（选填）</Label><Input id="company" value={draft.targetCompany} onChange={(event)=>patch({targetCompany:event.target.value})} maxLength={100}/></div><div className="space-y-2"><Label>难度</Label><Select value={draft.difficulty} onValueChange={(value)=>patch({difficulty:value as SetupDraft["difficulty"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="初级">初级</SelectItem><SelectItem value="中级">中级</SelectItem><SelectItem value="高级">高级</SelectItem></SelectContent></Select></div></div>
        <div className="space-y-2"><Label htmlFor="jd">岗位需求描述（选填）</Label><Textarea id="jd" value={draft.jobDescription} onChange={(event)=>patch({jobDescription:event.target.value})} maxLength={2000} className="min-h-32"/><p className="text-xs text-muted-foreground">粘贴职责与任职要求即可，不需要提供个人敏感信息。</p></div>
        <Button type="button" className="w-full" disabled={!goalReady} onClick={()=>setStep(2)}>下一步：确认方案<ArrowRight/></Button>
      </CardContent></Card>:<div className="space-y-6">
        <AgentReadinessStatus readiness={readiness.data} checking={readiness.isFetching} error={readiness.isError} onAction={recover}/>
        {createRecovery.failure&&<AgentCreateError failure={createRecovery.failure} retrying={session.loading} onAction={recoverCreate}/>}
        <Card><CardHeader><CardTitle>执行方案</CardTitle><CardDescription>面试开始前可调整，创建后按此计划冻结。</CardDescription></CardHeader><CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>角色模式</Label><div className="grid grid-cols-2 gap-2"><Button type="button" variant={draft.mode==="single"?"default":"outline"} onClick={()=>patch({mode:"single"})}><Users/>单面试官</Button><Button type="button" variant={draft.mode==="panel"?"default":"outline"} onClick={()=>patch({mode:"panel"})}><Users/>技术·主管·HR</Button></div></div><div className="space-y-2"><Label>交互通道</Label><div className="grid grid-cols-2 gap-2"><Button type="button" variant={draft.interviewMode==="text"?"default":"outline"} onClick={()=>patch({interviewMode:"text"})}><Keyboard/>文本</Button><Button type="button" variant={draft.interviewMode==="voice"?"default":"outline"} onClick={()=>patch({interviewMode:"voice"})}><Mic2/>语音</Button></div></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>题目数量</Label><Select value={String(draft.questionCount)} onValueChange={(value)=>patch({questionCount:Number(value)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:8},(_,index)=>index+3).map((count)=><SelectItem key={count} value={String(count)}>{count} 题</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>模型</Label><Select value={draft.modelProvider} onValueChange={(value)=>patch({modelProvider:value as SetupDraft["modelProvider"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="deepseek">DeepSeek</SelectItem><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent></Select></div></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div className="flex gap-3"><Globe className="size-5 text-muted-foreground"/><div><div className="text-sm font-medium">联网研究</div><div className="text-xs text-muted-foreground">Tavily 优先；无 Key 时自动使用公开知识检索。</div></div></div><Switch aria-label="启用联网研究" checked={draft.webResearch} onCheckedChange={(value)=>patch({webResearch:value})}/></div>
          <div className="rounded-xl bg-muted p-4"><div className="mb-3 flex items-center gap-2 font-medium"><CheckCircle2 className="size-5 text-primary"/>计划预览</div><ul className="space-y-2 text-sm text-muted-foreground"><li>{draft.difficulty} · {draft.position.trim()} · {draft.questionCount} 题</li><li>{draft.mode==="panel"?"技术、主管与 HR 分阶段面试":"单一综合面试官"} · {draft.interviewMode==="voice"?"语音互动":"文本互动"}</li><li>{draft.webResearch?"将研究公司、岗位与行业公开资料":"不使用联网资料"}</li></ul></div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={()=>setStep(1)}><ArrowLeft/>返回修改目标</Button><Button type="submit" className="min-h-11 flex-1" disabled={session.loading||readiness.isFetching||!readiness.data||readiness.data.status==="blocked"||!goalReady}>{session.loading?<><Loader2 className="animate-spin"/>正在准备面试</>:readiness.data?.status==="blocked"?"完成恢复动作后即可开始":"创建并开始面试"}</Button></div>
        </CardContent></Card>
      </div>}
    </form>
  </div>;
}
