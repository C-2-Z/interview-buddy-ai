/** 应用外壳：侧边栏导航 - 类型定义 */
import type { LucideIcon } from "lucide-react";

export type AppNavigationPath =
  "/interview-hub" | "/resumes" | "/history" | "/bank" | "/knowledge" | "/settings";

export type AppNavigationItem = {
  label: string;
  description: string;
  to: AppNavigationPath;
  icon: LucideIcon;
};

export type AppNavigationGroup = {
  label: string;
  items: AppNavigationItem[];
};
