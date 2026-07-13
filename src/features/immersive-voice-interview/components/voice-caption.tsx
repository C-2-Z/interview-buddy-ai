/** immersive-voice-interview：可关闭的实时字幕，不承担错误恢复。 */
import type { VoiceCaptionView } from "../types";

/** 字幕组件属性。 */
export type VoiceCaptionProps = Readonly<{
  /** 当前字幕；null 时保留固定高度。 */ caption: VoiceCaptionView | null;
  /** 用户是否开启字幕。 */ visible: boolean;
}>;

// 字幕容器预留空间避免状态变化造成布局跳动。
export function VoiceCaption({ caption, visible }: VoiceCaptionProps) {
  return (
    <div
      className="flex min-h-24 w-full max-w-3xl items-center justify-center px-4 text-center"
      aria-live={visible ? "polite" : "off"}
    >
      {visible && caption && (
        <div>
          <p className="text-xs font-medium text-voice-muted">
            {caption.speaker === "candidate"
              ? "你的回答"
              : caption.speaker === "interviewer"
                ? "面试官"
                : "系统"}
            {caption.partial ? " · 实时转写" : ""}
          </p>
          <p className="mt-2 text-base leading-7 text-voice-foreground sm:text-lg">
            {caption.text}
          </p>
        </div>
      )}
    </div>
  );
}
