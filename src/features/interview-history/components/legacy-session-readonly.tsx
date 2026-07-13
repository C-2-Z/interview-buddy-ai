/** 旧会话只读详情：保留历史答案、评分与反馈，不暴露任何写操作。 */
import {useEffect,useState} from "react";
import {ArrowLeft,Loader2} from "lucide-react";
import {useRouter} from "@tanstack/react-router";
import {apiRequest} from "@/shared/api/http-client";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";

/** legacy 读取响应。 */
type LegacyView={session:{id:string;position:string;difficulty:string;status:string;overall_score:number|null;overall_feedback:string|null};questions:Array<{id:string;order_index:number;question:string;answer:string|null;score:number|null;feedback:string|null}>};
/** 页面参数。 */
export type LegacySessionReadonlyProps={/** 旧会话 UUID。 */sessionId:string};

/** 渲染旧数据，不提供继续、评分或消息按钮。 */
export function LegacySessionReadonly({sessionId}:LegacySessionReadonlyProps){
  const router=useRouter();const [view,setView]=useState<LegacyView|null>(null);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{apiRequest<LegacyView>("GET",`/api/sessions/${sessionId}`).then(setView).catch((reason)=>setError(reason instanceof Error?reason.message:"旧会话加载失败"));},[sessionId]);
  if(error)return <div className="p-12 text-center text-destructive">{error}</div>;if(!view)return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin"/></div>;
  return <div className="mx-auto max-w-4xl space-y-5"><header className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={()=>router.history.back()}><ArrowLeft/></Button><div><div className="flex gap-2"><h1 className="text-2xl font-bold">{view.session.position}</h1><Badge variant="secondary">旧会话只读</Badge></div><p className="text-sm text-muted-foreground">{view.session.difficulty} · {view.session.status}</p></div></header>
    {view.session.overall_score!==null&&<Card><CardHeader><CardTitle>综合评分 {view.session.overall_score}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{view.session.overall_feedback}</CardContent></Card>}
    {view.questions.map((question)=><Card key={question.id}><CardHeader><CardTitle className="text-base">第 {question.order_index+1} 题 · {question.question}</CardTitle></CardHeader><CardContent className="space-y-3"><div><div className="text-xs text-muted-foreground">历史回答</div><p className="mt-1 whitespace-pre-wrap text-sm">{question.answer||"未作答"}</p></div>{question.score!==null&&<div className="rounded-xl bg-muted p-3 text-sm"><strong>{question.score} 分</strong><p className="mt-1 text-muted-foreground">{question.feedback}</p></div>}</CardContent></Card>)}
  </div>;
}
