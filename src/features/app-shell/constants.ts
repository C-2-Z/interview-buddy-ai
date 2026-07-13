import { BookOpen, FileStack, History, Settings, Sparkles, BrainCircuit } from "lucide-react";
import type { AppNavigationGroup } from "./types";

export const APP_NAVIGATION: AppNavigationGroup[] = [
  {
    label: "面试准备",
    items: [
      {
        label: "面试中心",
        description: "开始或继续一次模拟面试",
        to: "/interview-hub",
        icon: Sparkles,
      },
      { label: "简历管理", description: "管理简历与 AI 分析", to: "/resumes", icon: FileStack },
      { label: "面试记录", description: "查看记录与评估报告", to: "/history", icon: History },
    ],
  },
  {
    label: "资源",
    items: [
      { label: "公共题库", description: "按岗位和题型专项练习", to: "/bank", icon: BookOpen },
      {
        label: "知识库",
        description: "RAG 知识库与知识图谱",
        to: "/knowledge",
        icon: BrainCircuit,
      },
    ],
  },
  {
    label: "系统",
    items: [{ label: "设置", description: "模型与 API Key 配置", to: "/settings", icon: Settings }],
  },
];

export const APP_VERSION = "Core UI · 2026.07";
