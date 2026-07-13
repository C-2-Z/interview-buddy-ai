/** Agent 创建失败恢复组件：就近展示原因和唯一主恢复动作。 */
import {AlertCircle,RefreshCw,Settings} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {AgentCreateFailure,AgentCreateRecoveryAction} from "../types";

/** 创建失败组件属性。 */
export type AgentCreateErrorProps={
  /** 最近一次创建失败。 */failure:AgentCreateFailure;
  /** 是否正在重试创建。 */retrying:boolean;
  /** 执行恢复协议中的唯一动作。 */onAction(action:AgentCreateRecoveryAction):void;
};

const LABELS:Record<AgentCreateRecoveryAction,string>={retry_create:"原地重试",recheck:"重新检查",open_settings:"前往设置",contact_admin:"联系管理员"};

// 失败卡片使用 alert 立即播报，并明确说明草稿仍在，避免用户重复填写。
export function AgentCreateError({failure,retrying,onAction}:AgentCreateErrorProps){
  const Icon=failure.action==="open_settings"?Settings:RefreshCw;
  return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
    <div className="flex gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true"/><div><p className="font-medium">面试创建失败</p><p className="mt-1 text-sm text-muted-foreground">{failure.message}</p><p className="mt-1 text-xs text-muted-foreground">你的岗位、难度和其他表单内容均已保留。</p></div></div>
    <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={retrying} onClick={()=>onAction(failure.action)}><Icon className={retrying?"animate-spin":undefined}/>{retrying?"正在重试…":LABELS[failure.action]}</Button>
  </div>;
}
