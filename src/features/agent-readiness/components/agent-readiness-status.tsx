/** Agent readiness 状态组件：展示检查进度、阻断原因和就地恢复动作。 */
import {AlertCircle,CheckCircle2,Loader2,RefreshCw,TriangleAlert} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {AgentReadinessResponse,ReadinessIssue,ReadinessRecoveryAction} from "../types";

/** 状态组件属性。 */
export type AgentReadinessStatusProps={
  /** readiness 查询结果。 */readiness:AgentReadinessResponse|undefined;
  /** 是否正在首次或重新检查。 */checking:boolean;
  /** 请求本身是否失败。 */error:boolean;
  /** 执行固定恢复动作。 */onAction(action:ReadinessRecoveryAction):void;
};

const ACTION_LABELS:Record<ReadinessRecoveryAction,string>={open_settings:"前往设置",retry:"重试检查",use_text:"切换文本模式",disable_research:"关闭联网研究后继续",contact_admin:"联系管理员"};

// 状态组件在加载时播报进度，在失败时使用 alert，并把每个问题与唯一恢复按钮相邻展示。
export function AgentReadinessStatus({readiness,checking,error,onAction}:AgentReadinessStatusProps){
  if(checking&&!readiness)return <div className="flex min-h-16 items-center gap-3 rounded-xl border bg-muted/30 p-4 text-sm" aria-live="polite"><Loader2 className="size-5 animate-spin" aria-hidden="true"/><span>正在检查是否可以开始面试…</span></div>;
  if(error&&!readiness)return <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert"><div className="flex gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true"/><div><p className="font-medium">暂时无法完成开始前检查</p><p className="text-sm text-muted-foreground">请重试；检查完成前不会发送创建请求。</p></div></div><Button type="button" variant="outline" className="min-h-11" onClick={()=>onAction("retry")}><RefreshCw/>重试检查</Button></div>;
  if(!readiness)return null;
  const Icon=readiness.status==="ready"?CheckCircle2:readiness.status==="degraded"?TriangleAlert:AlertCircle;
  const title=readiness.status==="ready"?"可以开始面试":readiness.status==="degraded"?"可以开始，部分能力已降级":"需要先完成设置";
  const issues=[...readiness.blockers,...readiness.warnings];
  return <section className="space-y-3 rounded-xl border p-4" aria-live="polite" aria-busy={checking}>
    <div className="flex gap-3"><Icon className={`mt-0.5 size-5 shrink-0 ${readiness.status==="blocked"?"text-destructive":readiness.status==="degraded"?"text-amber-600 dark:text-amber-400":"text-emerald-600 dark:text-emerald-400"}`} aria-hidden="true"/><div><h2 className="font-medium">{title}</h2><p className="text-sm text-muted-foreground">{readiness.checkpointMode==="durable"?"本场面试支持服务重启后恢复。":readiness.checkpointMode==="ephemeral"?"当前仅支持本次服务运行期间恢复。":"恢复服务不可用。"}</p></div></div>
    {issues.length>0&&<div className="space-y-3">{issues.map((issue:ReadinessIssue)=><div key={issue.code} className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{issue.message}</p><Button type="button" variant={readiness.blockers.includes(issue)?"default":"outline"} className="min-h-11 shrink-0" onClick={()=>onAction(issue.recoveryAction)}>{ACTION_LABELS[issue.recoveryAction]}</Button></div>)}</div>}
    {checking&&<p className="text-xs text-muted-foreground">正在刷新检查结果…</p>}
  </section>;
}
