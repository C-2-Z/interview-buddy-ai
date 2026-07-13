/** immersive-voice-interview：始终可恢复的暂停、字幕、全屏和退出控制。 */
import { Captions, CaptionsOff, LogOut, Maximize2, Mic, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** 安全控制条属性。 */
export type VoiceEmergencyControlsProps = Readonly<{
  /** 当前是否暂停。 */ paused: boolean;
  /** 当前是否显示字幕。 */ captionsVisible: boolean;
  /** 是否已经全屏。 */ fullscreen: boolean;
  /** 是否正在收音。 */ recording: boolean;
  /** 是否可主动打断并回答。 */ canStartAnswer: boolean;
  /** 暂停。 */ onPause(): void;
  /** 继续。 */ onResume(): void;
  /** 切换字幕。 */ onToggleCaptions(): void;
  /** 请求全屏。 */ onFullscreen(): void;
  /** 主动开始回答。 */ onStartAnswer(): void;
  /** 确认退出。 */ onExit(): void;
}>;

// 控制条默认弱化，但所有按钮保持 44px 以上触控区域和明确文本标签。
export function VoiceEmergencyControls(props: VoiceEmergencyControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-voice-border bg-voice-surface/95 p-2 shadow-2xl backdrop-blur">
      {props.canStartAnswer && !props.recording && (
        <Button variant="secondary" className="min-h-11" onClick={props.onStartAnswer}>
          <Mic />
          现在回答
        </Button>
      )}
      <Button
        variant="ghost"
        className="min-h-11 text-voice-foreground hover:bg-voice-surface-strong hover:text-voice-foreground"
        onClick={props.paused ? props.onResume : props.onPause}
      >
        {props.paused ? (
          <>
            <Play />
            继续
          </>
        ) : (
          <>
            <Pause />
            暂停
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        className="min-h-11 text-voice-foreground hover:bg-voice-surface-strong hover:text-voice-foreground"
        onClick={props.onToggleCaptions}
      >
        {props.captionsVisible ? (
          <>
            <CaptionsOff />
            关闭字幕
          </>
        ) : (
          <>
            <Captions />
            开启字幕
          </>
        )}
      </Button>
      {!props.fullscreen && (
        <Button
          variant="ghost"
          className="min-h-11 text-voice-foreground hover:bg-voice-surface-strong hover:text-voice-foreground"
          onClick={props.onFullscreen}
        >
          <Maximize2 />
          全屏
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            className="min-h-11 text-voice-muted hover:bg-voice-surface-strong hover:text-voice-foreground"
          >
            <LogOut />
            退出
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出本场语音面试？</AlertDialogTitle>
            <AlertDialogDescription>
              当前已提交的回答仍会保留。退出后可从历史记录继续这场面试。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续面试</AlertDialogCancel>
            <AlertDialogAction onClick={props.onExit}>确认退出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
