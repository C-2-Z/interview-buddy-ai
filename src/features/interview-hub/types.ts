/** interview-hub：双入口首页的模式定义。 */
import type { LucideIcon } from "lucide-react";

/** 首页一个模式面板的静态产品信息。 */
export type InterviewHomeMode = Readonly<{
  /** 模式稳定标识。 */
  id: "text" | "voice";
  /** 面板标题。 */
  title: string;
  /** 一句话定位。 */
  eyebrow: string;
  /** 产品能力说明。 */
  description: string;
  /** 最多三条核心收益。 */
  benefits: readonly string[];
  /** 主操作文案。 */
  action: string;
  /** 目标路由。 */
  to: "/new" | "/voice/new";
  /** Lucide 图标。 */
  icon: LucideIcon;
}>;
