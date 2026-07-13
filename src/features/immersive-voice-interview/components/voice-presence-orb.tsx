/** immersive-voice-interview：用语义状态呈现声音存在感，支持 reduced motion。 */
import type { ImmersiveVoiceState } from "../types";

/** 声音状态视觉体属性。 */
export type VoicePresenceOrbProps = Readonly<{
  /** 当前沉浸语音状态。 */ state: ImmersiveVoiceState;
}>;

// 三层 transform/opacity 动画只表达说话、聆听、处理或重连状态，不承载唯一信息。
export function VoicePresenceOrb({ state }: VoicePresenceOrbProps) {
  return (
    <div className="voice-presence-orb" data-state={state} aria-hidden="true">
      <span className="voice-presence-orb__halo" />
      <span className="voice-presence-orb__ring" />
      <span className="voice-presence-orb__core" />
    </div>
  );
}
