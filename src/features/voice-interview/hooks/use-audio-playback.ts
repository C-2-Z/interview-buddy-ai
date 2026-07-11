/** voice-interview - 音频播放 */
import { useRef, useState } from "react";

function pcm16ToFloat32(chunk: ArrayBuffer): Float32Array {
  const view = new DataView(chunk);
  const samples = new Float32Array(Math.floor(chunk.byteLength / 2));
  for (let i = 0; i < samples.length; i += 1) {
    const value = view.getInt16(i * 2, true);
    samples[i] = Math.max(-1, Math.min(1, value / 32768));
  }
  return samples;
}

export function useAudioPlayback() {
  const [speaking, setSpeaking] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const currentTurnId = useRef<string | null>(null);
  const sampleRate = useRef(16000);
  const nextStartTime = useRef(0);
  const sources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const finished = useRef(false);

  function getContext(): AudioContext {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }
    void audioContext.current.resume();
    return audioContext.current;
  }

  function clearSources() {
    for (const source of sources.current) {
      try {
        source.stop();
      } catch {
        // Source may have already ended.
      }
    }
    sources.current.clear();
  }

  function start(turnId: string, nextSampleRate: number) {
    stop();
    currentTurnId.current = turnId;
    sampleRate.current = nextSampleRate;
    nextStartTime.current = 0;
    finished.current = false;
    setSpeaking(true);
  }

  function addChunk(turnId: string, chunk: ArrayBuffer) {
    if (currentTurnId.current !== turnId || chunk.byteLength === 0) return;

    const ctx = getContext();
    const samples = pcm16ToFloat32(chunk.slice(0));
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, sampleRate.current);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime + 0.02;
    const startAt = Math.max(nextStartTime.current, now);
    nextStartTime.current = startAt + buffer.duration;
    sources.current.add(source);
    setSpeaking(true);

    source.onended = () => {
      sources.current.delete(source);
      if (finished.current && sources.current.size === 0) {
        setSpeaking(false);
        currentTurnId.current = null;
      }
    };
    source.start(startAt);
  }

  async function finish(turnId: string) {
    if (currentTurnId.current !== turnId) return;
    finished.current = true;
    if (sources.current.size === 0) {
      setSpeaking(false);
      currentTurnId.current = null;
    }
  }

  function stop() {
    clearSources();
    setSpeaking(false);
    currentTurnId.current = null;
    nextStartTime.current = 0;
    finished.current = true;
  }

  return {
    speaking,
    start,
    addChunk,
    finish,
    stop,
  };
}
