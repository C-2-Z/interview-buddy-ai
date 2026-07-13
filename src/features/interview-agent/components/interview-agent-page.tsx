/** 统一 Agent 面试工作台：真实事件对话、文本/语音输入、研究、证据、评分与报告。 */
import {useCallback,useMemo,useState} from "react";
import {ArrowLeft,ExternalLink,Loader2,Mic,MicOff,RotateCw,Send,Square,VolumeX} from "lucide-react";
import {useRouter} from "@tanstack/react-router";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {ScrollArea} from "@/components/ui/scroll-area";
import {useAgentSession} from "../hooks/use-agent-session";
import {useAgentVoice,type AgentVoiceEvent} from "../hooks/use-agent-voice";
import {AGENT_PHASE_DISPLAY,AGENT_ROLE_DISPLAY,type AgentRoleId,type AgentWorkspaceMessage} from "../types";

/** 页面参数。 */
export type InterviewAgentPageProps={/** 已创建的 Agent 会话 UUID。 */sessionId:string};

/** 时间线消息增加题目/角色元数据。 */
type TimelineMessage=AgentWorkspaceMessage&{roleId:AgentRoleId;questionId:string;kind:"question"|"message"};

/** 将题目和对话投影为稳定时间线。 */
function buildTimeline(workspace:NonNullable<ReturnType<typeof useAgentSession>["workspace"]>):TimelineMessage[]{
  return workspace.questions.flatMap((question)=>[
    {id:`question:${question.id}`,role:"assistant" as const,content:question.question,source:"text" as const,interrupted:false,createdAt:"",roleId:question.roleId,questionId:question.id,kind:"question" as const},
    ...question.messages.map((message)=>({...message,roleId:question.roleId,questionId:question.id,kind:"message" as const})),
  ]);
}

/** 角色 Badge class。 */
function roleClass(role:AgentRoleId):string{return `${AGENT_ROLE_DISPLAY[role].color} text-white`;}

/** 完成报告卡。 */
function ReportCard({score,feedback}:{score:number;feedback:string}){
  return <Card className="border-primary/30 bg-primary/5"><CardHeader><CardTitle>面试报告</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="text-5xl font-bold text-primary">{score}</div><p className="text-sm leading-6 text-muted-foreground">{feedback}</p></CardContent></Card>;
}

/** Agent 面试主页面。 */
export function InterviewAgentPage({sessionId}:InterviewAgentPageProps){
  const router=useRouter();const session=useAgentSession(sessionId);const [input,setInput]=useState("");const [voiceNotice,setVoiceNotice]=useState("");
  const workspace=session.workspace;const snapshot=session.snapshot;const timeline=useMemo(()=>workspace?buildTimeline(workspace):[],[workspace]);
  const handleVoiceEvent=useCallback((event:AgentVoiceEvent)=>{if(event.type==="transcript_final")setVoiceNotice(`已识别：${event.text}`);else if(event.type==="question_scored")setVoiceNotice(`本题评分 ${event.score} 分`);else if(event.type==="session_completed")setVoiceNotice(`面试完成：${event.overallScore} 分`);else if(event.type==="error")setVoiceNotice(event.message);if(["transcript_final","question_scored","next_question","session_completed"].includes(event.type))void session.refresh();},[session.refresh]);
  const voice=useAgentVoice({sessionId,questionId:snapshot?.currentQuestionId??null,onEvent:handleVoiceEvent});

  /** 提交文本框回答。 */
  const submit=useCallback(async()=>{const content=input.trim();if(!content)return;setInput("");try{await session.submitInput(content);}catch{setInput(content);}},[input,session.submitInput]);

  if(session.loading&&!workspace)return <div className="flex min-h-96 items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground"/></div>;
  if(!workspace||!snapshot)return <div className="mx-auto max-w-lg py-16 text-center"><p className="text-destructive">{session.error??"无法加载 Agent 会话"}</p><Button variant="outline" className="mt-4" onClick={()=>void session.refresh()}><RotateCw/>重试</Button></div>;
  const isVoice=snapshot.interviewMode==="voice";const canAnswer=snapshot.phase==="awaiting_answer";

  return <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
    <section className="flex min-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={()=>router.history.back()}><ArrowLeft/></Button><div><h1 className="font-semibold">{workspace.config.position} · Agent 面试</h1><p className="text-xs text-muted-foreground">{workspace.config.difficulty} · {workspace.config.questionCount} 题 · {isVoice?"语音":"文本"}</p></div></div>
        <div className="flex flex-wrap gap-2"><Badge variant={session.connected?"default":"secondary"}>{session.connected?"事件流在线":"轮询恢复"}</Badge><Badge variant="outline">{AGENT_PHASE_DISPLAY[snapshot.phase]}</Badge><Badge className={roleClass(snapshot.currentRole)}>{AGENT_ROLE_DISPLAY[snapshot.currentRole].label}</Badge></div>
      </header>
      <div className="flex flex-wrap gap-3 border-b px-4 py-2 text-xs text-muted-foreground"><span>第 {Math.min(snapshot.currentQuestionIndex+1,workspace.config.questionCount)} / {workspace.config.questionCount} 题</span><span>追问 {snapshot.followUpCount}/3</span><span>事件 #{snapshot.eventCursor}</span>{session.error&&<span className="text-destructive">{session.error}</span>}</div>
      <ScrollArea className="flex-1 p-4"><div className="space-y-4">
        {timeline.map((message)=><div key={message.id} className={`flex ${message.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role==="user"?"bg-primary text-primary-foreground":"bg-muted"}`}>
          {message.role==="assistant"&&<div className="mb-1 flex items-center gap-2 text-xs opacity-70"><Badge className={`${roleClass(message.roleId)} px-1.5 py-0 text-[10px]`}>{AGENT_ROLE_DISPLAY[message.roleId].label}</Badge>{message.kind==="question"&&<span>正式题目</span>}</div>}
          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>{message.role==="user"&&<div className="mt-1 text-right text-[10px] opacity-70">{message.source==="voice"?"语音识别":"文本输入"}</div>}
        </div></div>)}
        {timeline.length===0&&<div className="py-16 text-center text-sm text-muted-foreground">Agent 正在研究岗位并准备题目…</div>}
      </div></ScrollArea>
      <footer className="border-t p-4">
        {isVoice?<div className="space-y-3"><div className="text-center text-sm text-muted-foreground">{voice.partial||voiceNotice||voice.stage}</div><div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={()=>void voice.connect()} disabled={voice.connected}>{voice.connected?"语音已连接":"连接语音"}</Button>
          {!voice.recording?<Button onClick={()=>void voice.start()} disabled={!voice.connected||!canAnswer||voice.speaking}><Mic/>开始回答</Button>:<Button variant="destructive" onClick={()=>void voice.stop()}><Square/>结束回答</Button>}
          <Button variant="outline" onClick={voice.interrupt} disabled={!voice.speaking}><VolumeX/>打断播报</Button>
        </div></div>:<div className="flex gap-2"><Input value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void submit();}}} placeholder={canAnswer?"输入你的回答…":"等待 Agent 完成当前步骤…"} disabled={!canAnswer||session.loading}/><Button onClick={()=>void submit()} disabled={!canAnswer||!input.trim()||session.loading}>{session.loading?<Loader2 className="animate-spin"/>:<Send/>}</Button></div>}
      </footer>
    </section>
    <aside className="space-y-4">
      {workspace.report&&<ReportCard score={workspace.report.overallScore} feedback={workspace.report.overallFeedback}/>}
      <Card><CardHeader><CardTitle className="text-base">研究上下文</CardTitle></CardHeader><CardContent className="space-y-3"><Badge variant="outline">{workspace.research.status}</Badge>{workspace.research.sources.length===0?<p className="text-xs text-muted-foreground">本场未使用外部研究来源。</p>:workspace.research.sources.map((source)=><a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-2 text-sm text-primary hover:underline"><span>{source.title}</span><ExternalLink className="mt-0.5 size-3 shrink-0"/></a>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">证据与评分</CardTitle></CardHeader><CardContent className="space-y-3">{workspace.questions.map((question)=><div key={question.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2 text-sm font-medium"><span>第 {question.orderIndex+1} 题</span><span>{question.evaluation?`${question.evaluation.overallScore} 分`:"待评分"}</span></div><p className="mt-1 text-xs text-muted-foreground">{question.dimensionKey} · {question.evidence.length} 条证据</p>{question.evidence.slice(0,2).map((item)=><blockquote key={item.id} className="mt-2 border-l-2 pl-2 text-xs text-muted-foreground">“{item.quote}”</blockquote>)}</div>)}</CardContent></Card>
      {!session.connected&&<Button variant="outline" className="w-full" onClick={session.reconnect}><RotateCw/>重连事件流</Button>}
    </aside>
  </div>;
}
