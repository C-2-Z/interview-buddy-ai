import { useRef, useState } from "react";

const TARGET_SAMPLE_RATE = 16000;

const workletSource = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = options.processorOptions.targetSampleRate || 16000;
    this.ratio = sampleRate / this.targetSampleRate;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;

    const outputLength = Math.max(1, Math.floor(input.length / this.ratio));
    const pcm = new Int16Array(outputLength);
    let sum = 0;

    for (let i = 0; i < outputLength; i += 1) {
      const sourceIndex = Math.min(input.length - 1, Math.floor(i * this.ratio));
      const sample = Math.max(-1, Math.min(1, input[sourceIndex]));
      sum += sample * sample;
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    const rms = Math.sqrt(sum / outputLength);
    this.port.postMessage(
      { audio: pcm.buffer, rms, speaking: rms > 0.02 },
      [pcm.buffer],
    );
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
`;

export function useAudioCapture(params: {
  onChunk: (chunk: ArrayBuffer) => void;
  onSpeechStart?: () => void;
  onDebug?: (stats: {
    chunks: number;
    bytes: number;
    rms: number;
    speaking: boolean;
    state: "starting" | "capturing" | "no-input" | "stopped";
  }) => void;
}) {
  const [recording, setRecording] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const node = useRef<AudioWorkletNode | null>(null);
  const source = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletUrl = useRef<string | null>(null);
  const speaking = useRef(false);
  const chunks = useRef(0);
  const bytes = useRef(0);
  const lastDebugAt = useRef(0);
  const noInputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start() {
    if (recording) return;
    chunks.current = 0;
    bytes.current = 0;
    lastDebugAt.current = 0;
    params.onDebug?.({
      chunks: 0,
      bytes: 0,
      rms: 0,
      speaking: false,
      state: "starting",
    });

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风录音或页面不是安全上下文");
    }

    let mediaStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let url: string | null = null;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      await audioContext.resume();
      const blob = new Blob([workletSource], { type: "text/javascript" });
      url = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(url);
    } catch (err) {
      for (const track of mediaStream?.getTracks() ?? []) track.stop();
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }
      if (url) URL.revokeObjectURL(url);
      throw err;
    }

    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    const processor = new AudioWorkletNode(audioContext, "pcm-capture-processor", {
      processorOptions: { targetSampleRate: TARGET_SAMPLE_RATE },
    });
    processor.port.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        audio: ArrayBuffer;
        rms: number;
        speaking: boolean;
      };
      chunks.current += 1;
      bytes.current += data.audio.byteLength;
      params.onChunk(data.audio);
      if (data.speaking && !speaking.current) {
        params.onSpeechStart?.();
      }
      speaking.current = data.speaking;

      const now = Date.now();
      if (
        chunks.current === 1 ||
        chunks.current % 100 === 0 ||
        now - lastDebugAt.current > 1000
      ) {
        lastDebugAt.current = now;
        params.onDebug?.({
          chunks: chunks.current,
          bytes: bytes.current,
          rms: data.rms,
          speaking: data.speaking,
          state: "capturing",
        });
      }
    };

    audioSource.connect(processor);
    processor.connect(audioContext.destination);

    stream.current = mediaStream;
    context.current = audioContext;
    node.current = processor;
    source.current = audioSource;
    workletUrl.current = url;
    setRecording(true);
    noInputTimer.current = setTimeout(() => {
      if (chunks.current === 0) {
        params.onDebug?.({
          chunks: 0,
          bytes: 0,
          rms: 0,
          speaking: false,
          state: "no-input",
        });
      }
    }, 3000);
  }

  async function stop() {
    if (noInputTimer.current) clearTimeout(noInputTimer.current);
    node.current?.disconnect();
    source.current?.disconnect();
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    if (context.current && context.current.state !== "closed") {
      await context.current.close();
    }
    if (workletUrl.current) URL.revokeObjectURL(workletUrl.current);

    stream.current = null;
    context.current = null;
    node.current = null;
    source.current = null;
    workletUrl.current = null;
    speaking.current = false;
    params.onDebug?.({
      chunks: chunks.current,
      bytes: bytes.current,
      rms: 0,
      speaking: false,
      state: "stopped",
    });
    setRecording(false);
  }

  return {
    recording,
    sampleRate: TARGET_SAMPLE_RATE,
    start,
    stop,
  };
}
