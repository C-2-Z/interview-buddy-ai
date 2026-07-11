import { useEffect, useRef, useState } from "react";

const playbackWorklet = `
class PcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.queuedSamples = 0;
    this.started = false;
    this.finished = false;
    this.prebufferSamples = Math.round(sampleRate * 0.06);
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'chunk') {
        const samples = new Int16Array(data.audio);
        if (samples.length) {
          this.queue.push(samples);
          this.queuedSamples += samples.length;
        }
      } else if (data.type === 'finish') {
        this.finished = true;
      } else if (data.type === 'reset') {
        this.queue = [];
        this.offset = 0;
        this.queuedSamples = 0;
        this.started = false;
        this.finished = false;
      }
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    output.fill(0);
    if (!this.started) {
      if (this.queuedSamples < this.prebufferSamples && !this.finished) return true;
      if (this.queuedSamples > 0) {
        this.started = true;
        this.port.postMessage({ type: 'started' });
      }
    }
    for (let i = 0; i < output.length && this.queue.length; i += 1) {
      const current = this.queue[0];
      output[i] = Math.max(-1, Math.min(1, current[this.offset] / 32768));
      this.offset += 1;
      this.queuedSamples -= 1;
      if (this.offset >= current.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    if (this.finished && this.queuedSamples === 0 && this.started) {
      this.started = false;
      this.finished = false;
      this.port.postMessage({ type: 'drained' });
    }
    return true;
  }
}
registerProcessor('pcm-playback-processor', PcmPlaybackProcessor);
`;

export function useAudioPlayback() {
  const [speaking, setSpeaking] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const node = useRef<AudioWorkletNode | null>(null);
  const workletUrl = useRef<string | null>(null);
  const currentTurnId = useRef<string | null>(null);
  const currentSampleRate = useRef(24000);
  const pending = useRef<ArrayBuffer[]>([]);
  const initializing = useRef<Promise<void> | null>(null);
  const finishRequested = useRef(false);

  async function initialize(sampleRate: number) {
    if (node.current && context.current?.sampleRate === sampleRate) return;
    if (initializing.current) return initializing.current;
    initializing.current = (async () => {
      if (context.current && context.current.state !== "closed") await context.current.close();
      if (workletUrl.current) URL.revokeObjectURL(workletUrl.current);
      const nextContext = new AudioContext({ sampleRate });
      await nextContext.resume();
      const url = URL.createObjectURL(new Blob([playbackWorklet], { type: "text/javascript" }));
      await nextContext.audioWorklet.addModule(url);
      const nextNode = new AudioWorkletNode(nextContext, "pcm-playback-processor");
      nextNode.connect(nextContext.destination);
      nextNode.port.onmessage = (event) => {
        if (event.data?.type === "started") setSpeaking(true);
        if (event.data?.type === "drained") {
          setSpeaking(false);
          currentTurnId.current = null;
        }
      };
      context.current = nextContext;
      node.current = nextNode;
      workletUrl.current = url;
      for (const chunk of pending.current.splice(0)) {
        nextNode.port.postMessage({ type: "chunk", audio: chunk }, [chunk]);
      }
      if (finishRequested.current) nextNode.port.postMessage({ type: "finish" });
    })().finally(() => { initializing.current = null; });
    return initializing.current;
  }

  function start(turnId: string, sampleRate: number) {
    stop();
    currentTurnId.current = turnId;
    currentSampleRate.current = sampleRate;
    finishRequested.current = false;
    setSpeaking(true);
    void initialize(sampleRate);
  }

  function addChunk(turnId: string, chunk: ArrayBuffer) {
    if (currentTurnId.current !== turnId || chunk.byteLength === 0) return;
    if (node.current && context.current?.sampleRate === currentSampleRate.current) {
      node.current.port.postMessage({ type: "chunk", audio: chunk }, [chunk]);
    } else {
      pending.current.push(chunk);
      void initialize(currentSampleRate.current);
    }
  }

  async function finish(turnId: string) {
    if (currentTurnId.current !== turnId) return;
    finishRequested.current = true;
    await initialize(currentSampleRate.current);
    node.current?.port.postMessage({ type: "finish" });
  }

  function stop() {
    node.current?.port.postMessage({ type: "reset" });
    pending.current = [];
    finishRequested.current = false;
    currentTurnId.current = null;
    setSpeaking(false);
  }

  useEffect(() => () => {
    node.current?.disconnect();
    if (context.current && context.current.state !== "closed") void context.current.close();
    if (workletUrl.current) URL.revokeObjectURL(workletUrl.current);
  }, []);

  return { speaking, start, addChunk, finish, stop };
}
