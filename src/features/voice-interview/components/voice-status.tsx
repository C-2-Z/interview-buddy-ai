import { Badge } from "@/components/ui/badge";

export type VoiceStatusValue =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "scored";

const STATUS_LABELS: Record<VoiceStatusValue, string> = {
  idle: "待连接",
  connecting: "连接中",
  listening: "正在听",
  thinking: "AI 思考中",
  speaking: "AI 说话中",
  interrupted: "已打断",
  scored: "已评分",
};

export function VoiceStatus({ status }: { status: VoiceStatusValue }) {
  return <Badge variant="outline">{STATUS_LABELS[status]}</Badge>;
}
