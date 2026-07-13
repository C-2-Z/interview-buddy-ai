/** Interview hub：按用户训练目标组织入口，并提供未完成会话与报告的快速返回。 */
import {Link} from "@tanstack/react-router";
import {ArrowRight,Bot,BriefcaseBusiness,CheckCircle2,FileStack,History,RotateCw,Target} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Skeleton} from "@/components/ui/skeleton";
import {useInterviewHub} from "../hooks/use-interview-hub";
import type {RecentInterview} from "../types";

/** 目标驱动入口；每张卡对应用户要完成的任务而非底层技术。 */
const GOAL_CARDS=[
  {title:"快速模拟",description:"选择岗位和难度，几分钟内开始一场完整模拟。",to:"/new" as const,action:"配置一场面试",icon:Bot,className:"bg-primary text-primary-foreground"},
  {title:"针对 JD 准备",description:"粘贴岗位需求，围绕职责、技术栈和业务场景生成面试计划。",to:"/new" as const,action:"按 JD 开始",icon:BriefcaseBusiness,className:"bg-indigo-600 text-white"},
  {title:"从简历练追问",description:"选择一份简历，让面试官围绕真实经历追问证据与结果。",to:"/resumes" as const,action:"选择简历",icon:FileStack,className:"bg-emerald-600 text-white"},
  {title:"复练薄弱项",description:"从历史报告找到最低分能力，生成一场聚焦训练。",to:"/history" as const,action:"查看报告与弱项",icon:Target,className:"bg-amber-600 text-white"},
];

/** 根据产品状态把最近会话导向继续面试、完整报告或记录管理。 */
function RecentInterviewAction({session}:{session:RecentInterview}){
  if(!session.agent_version)return <Button variant="outline" size="sm" className="min-h-10" asChild><Link to="/legacy/$id" params={{id:session.id}}>只读查看</Link></Button>;
  if(session.status==="completed")return <Button variant="outline" size="sm" className="min-h-10" asChild><Link to="/report/$id" params={{id:session.id}}>查看报告</Link></Button>;
  return <Button variant="outline" size="sm" className="min-h-10" asChild><Link to="/session/$id" params={{id:session.id}}>{session.status==="paused"?"继续已暂停面试":session.status==="abandoned"?"管理已放弃记录":"继续面试"}</Link></Button>;
}

/** 目标驱动首页；先展示四种训练目标，再展示最近进度。 */
export function InterviewHubPage(){
  const hub=useInterviewHub();
  return <div className="space-y-10">
    <header className="max-w-3xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"><BriefcaseBusiness className="size-4"/>职业面试训练工作台</div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">今天要解决哪一个面试目标？</h1><p className="mt-3 text-base leading-7 text-muted-foreground">选择目标后再配置细节。每场面试都支持真实联网准备、暂停恢复、证据评分、独立报告和弱项复练。</p></header>
    <section aria-labelledby="goal-heading"><div className="mb-4"><h2 id="goal-heading" className="text-xl font-semibold">选择训练目标</h2><p className="mt-1 text-sm text-muted-foreground">不需要理解模型或 Agent，系统会在开始前检查可用性。</p></div><div className="grid gap-4 sm:grid-cols-2">{GOAL_CARDS.map((entry)=>{const Icon=entry.icon;return <Card key={entry.title} className="group flex min-h-60 flex-col border-border/80 transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-lg"><CardHeader><span className={`flex size-12 items-center justify-center rounded-2xl ${entry.className}`}><Icon className="size-6"/></span><CardTitle className="pt-3 text-xl">{entry.title}</CardTitle></CardHeader><CardContent className="flex flex-1 flex-col"><p className="flex-1 text-sm leading-6 text-muted-foreground">{entry.description}</p><Button className="mt-6 min-h-11 w-full justify-between" asChild><Link to={entry.to}>{entry.action}<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1"/></Link></Button></CardContent></Card>;})}</div></section>
    <section aria-labelledby="recent-heading" className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="recent-heading" className="text-xl font-semibold">最近进度</h2><p className="mt-1 text-sm text-muted-foreground">继续未完成练习，或打开已经生成的完整报告。</p></div><Button variant="ghost" className="min-h-11" asChild><Link to="/history"><History/>全部记录</Link></Button></div>
      {hub.loading?<div className="grid gap-3" aria-live="polite">{[0,1,2].map((item)=><Skeleton key={item} className="h-24 rounded-2xl"/>)}</div>:hub.error?<Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><p role="alert" className="text-sm text-muted-foreground">{hub.error}</p><Button variant="outline" onClick={()=>void hub.refresh()}><RotateCw/>重新加载</Button></CardContent></Card>:hub.sessions.length===0?<Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><CheckCircle2 className="size-8 text-primary"/><h3 className="mt-3 font-semibold">从第一次练习开始</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">完成面试后，这里会保留进度、得分和报告入口。</p><Button className="mt-5" asChild><Link to="/new">开始快速模拟</Link></Button></CardContent></Card>:<div className="grid gap-3">{hub.sessions.map((session)=><Card key={session.id}><CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary"><Bot className="size-5"/></span><div className="min-w-0 flex-1"><div className="truncate font-medium">{session.position}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{session.status==="completed"?"已完成":session.status==="paused"?"已暂停":session.status==="abandoned"?"已放弃":"进行中"}</Badge><span>{session.difficulty}</span><span>{new Date(session.created_at).toLocaleString("zh-CN")}</span></div></div>{session.overall_score!=null&&<div><span className="text-2xl font-bold tabular-nums text-primary">{session.overall_score}</span><span className="ml-1 text-xs text-muted-foreground">分</span></div>}<RecentInterviewAction session={session}/></CardContent></Card>)}</div>}
    </section>
  </div>;
}
