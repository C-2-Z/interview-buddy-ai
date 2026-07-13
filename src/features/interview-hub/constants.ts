/** interview-hub：双入口的稳定产品文案与路由。 */
import { Keyboard, MicVocal } from "lucide-react";
import type { InterviewHomeMode } from "./types";

/** 首页只允许的两个核心模式。 */
export const INTERVIEW_HOME_MODES: Record<"text" | "voice", InterviewHomeMode> = {
  text: {
    id: "text",
    eyebrow: "练习模式",
    title: "文字练习面试",
    description: "保留思考与修改空间，适合围绕岗位、简历和专项能力深入练习。",
    benefits: ["多轮追问与逐题作答", "回答草稿自动保留", "证据评分与完整复盘"],
    action: "开始文字练习",
    to: "/new",
    icon: Keyboard,
  },
  voice: {
    id: "voice",
    eyebrow: "模拟模式",
    title: "沉浸式语音面试",
    description: "自动播报、聆听和追问，把注意力留给表达本身，还原真实面试节奏。",
    benefits: ["开始前设备与服务检查", "自动收音与语音追问", "断线恢复与文字降级"],
    action: "进入语音候场",
    to: "/voice/new",
    icon: MicVocal,
  },
};
