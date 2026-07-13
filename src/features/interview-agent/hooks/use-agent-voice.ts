/** Agent 语音 Hook：浏览器 PCM 采集、Agent WebSocket、流式播放与打断。 */
import {useCallback,useEffect,useRef,useState} from "react";
import {connectAgentVoice} from "../api";

/** 后端语音事件的页面所需子集。 */
export type AgentVoiceEvent=
  |{type:"ready"|"assistant_text_done"|"generation_cancelled";turnId?:string}
  |{type:"session_ready";sessionId:string;questionId:string|null;currentQuestionIndex:number;totalQuestions:number}
  |{type:"voice_stage";stage:string;message:string;turnId?:string}
  |{type:"error";message:string;code?:string;turnId?:string}
  |{type:"transcript_partial"|"transcript_final"|"assistant_text";text:string;turnId:string}
  |{type:"assistant_audio_start";turnId:string;sampleRate:number}
  |{type:"assistant_audio_end"|"interrupted";turnId:string}
  |{type:"interviewer_prompt_start";turnId:string;questionId:string;text:string;currentQuestionIndex:number;totalQuestions:number}
  |{type:"interviewer_prompt_end";turnId:string;questionId:string}
  |{type:"next_question";questionId:string;currentQuestionIndex:number;totalQuestions:number}
  |{type:"question_scored";questionId:string;score:number;feedback:string}
  |{type:"session_completed";overallScore:number;overallFeedback:string};

/** Hook 输入。 */
export type UseAgentVoiceInput={
  /** voice 模式会话 UUID。 */ sessionId:string;
  /** 当前题目 UUID。 */ questionId:string|null;
  /** 结构化事件回调。 */ onEvent(event:AgentVoiceEvent):void;
};

/** 将浏览器 Float32 PCM 重采样为 16 kHz Int16。 */
function encodePcm16(input:Float32Array,inputRate:number):ArrayBuffer{
  const ratio=inputRate/16_000;const length=Math.max(1,Math.floor(input.length/ratio));const output=new Int16Array(length);
  for(let index=0;index<length;index+=1){const start=Math.floor(index*ratio);const end=Math.min(input.length,Math.floor((index+1)*ratio));let sum=0;for(let cursor=start;cursor<end;cursor+=1)sum+=input[cursor];const sample=Math.max(-1,Math.min(1,sum/Math.max(1,end-start)));output[index]=sample<0?sample*0x8000:sample*0x7fff;}
  return output.buffer;
}

/** 管理单个语音 Agent 连接。 */
export function useAgentVoice({sessionId,questionId,onEvent}:UseAgentVoiceInput){
  const [connected,setConnected]=useState(false);const [recording,setRecording]=useState(false);const [speaking,setSpeaking]=useState(false);const [stage,setStage]=useState("语音尚未连接");const [partial,setPartial]=useState("");
  const socketRef=useRef<WebSocket|null>(null);const mediaRef=useRef<MediaStream|null>(null);const captureContextRef=useRef<AudioContext|null>(null);const processorRef=useRef<ScriptProcessorNode|null>(null);const turnRef=useRef<string|null>(null);const outputTurnRef=useRef<string|null>(null);const playbackContextRef=useRef<AudioContext|null>(null);const nextPlaybackRef=useRef(0);const sourcesRef=useRef(new Set<AudioBufferSourceNode>());const sampleRateRef=useRef(24_000);

  /** 停止并清空所有尚未播放的 TTS。 */
  const stopPlayback=useCallback(()=>{for(const source of sourcesRef.current){try{source.stop();}catch{}}sourcesRef.current.clear();nextPlaybackRef.current=0;setSpeaking(false);},[]);

  /** 调度一个 Int16 PCM 块，保持服务端顺序且无块间重叠。 */
  const playChunk=useCallback(async(data:ArrayBuffer)=>{const context=playbackContextRef.current??new AudioContext();playbackContextRef.current=context;await context.resume();const samples=new Int16Array(data);const buffer=context.createBuffer(1,samples.length,sampleRateRef.current);const channel=buffer.getChannelData(0);for(let index=0;index<samples.length;index+=1)channel[index]=samples[index]/32768;const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);const start=Math.max(context.currentTime,nextPlaybackRef.current);nextPlaybackRef.current=start+buffer.duration;sourcesRef.current.add(source);source.onended=()=>sourcesRef.current.delete(source);source.start(start);},[]);

  /** 连接短期鉴权 WebSocket。 */
  const connect=useCallback(async()=>{if(socketRef.current?.readyState===WebSocket.OPEN)return;setStage("正在连接语音服务");const {wsUrl}=await connectAgentVoice(sessionId);const socket=new WebSocket(wsUrl);socket.binaryType="arraybuffer";socketRef.current=socket;socket.onopen=()=>{setConnected(true);setStage("语音服务已连接");};socket.onclose=()=>{setConnected(false);setRecording(false);setStage("语音连接已断开，可安全重连");};socket.onerror=()=>setStage("语音连接异常");socket.onmessage=(message)=>{if(message.data instanceof ArrayBuffer){void playChunk(message.data);return;}try{const event=JSON.parse(String(message.data)) as AgentVoiceEvent;onEvent(event);if(event.type==="voice_stage")setStage(event.message);if(event.type==="error")setStage(event.message);if(event.type==="transcript_partial")setPartial(event.text);if(event.type==="transcript_final")setPartial("");if(event.type==="assistant_audio_start"){sampleRateRef.current=event.sampleRate;outputTurnRef.current=event.turnId;setSpeaking(true);}if(event.type==="assistant_audio_end"||event.type==="interrupted"){outputTurnRef.current=null;setSpeaking(false);if(event.type==="interrupted")stopPlayback();}}catch{setStage("收到无法解析的语音事件");}};},[sessionId,onEvent,playChunk,stopPlayback]);

  /** 开始采集麦克风并发送稳定 turnId。 */
  const start=useCallback(async()=>{if(!connected||!questionId||recording)return;if(speaking){stopPlayback();if(outputTurnRef.current)socketRef.current?.send(JSON.stringify({type:"interrupt",questionId,turnId:outputTurnRef.current}));}const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});const context=new AudioContext();await context.resume();const source=context.createMediaStreamSource(stream);const processor=context.createScriptProcessor(4096,1,1);const silent=context.createGain();silent.gain.value=0;const turnId=crypto.randomUUID();turnRef.current=turnId;socketRef.current?.send(JSON.stringify({type:"audio_start",sessionId,questionId,turnId,sampleRate:16_000}));processor.onaudioprocess=(event)=>{const socket=socketRef.current;if(socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>512*1024)return;socket.send(encodePcm16(event.inputBuffer.getChannelData(0),context.sampleRate));};source.connect(processor);processor.connect(silent);silent.connect(context.destination);mediaRef.current=stream;captureContextRef.current=context;processorRef.current=processor;setRecording(true);setStage("正在录音，请开始回答");},[connected,questionId,recording,sessionId,speaking,stopPlayback]);

  /** 结束采集并要求 ASR 返回 final。 */
  const stop=useCallback(async()=>{processorRef.current?.disconnect();processorRef.current=null;for(const track of mediaRef.current?.getTracks()??[])track.stop();mediaRef.current=null;await captureContextRef.current?.close();captureContextRef.current=null;if(turnRef.current)socketRef.current?.send(JSON.stringify({type:"audio_end",turnId:turnRef.current}));turnRef.current=null;setRecording(false);setStage("正在识别并恢复 Agent");},[]);

  /** 打断正在播放的 Agent TTS。 */
  const interrupt=useCallback(()=>{const turnId=outputTurnRef.current;if(turnId&&questionId)socketRef.current?.send(JSON.stringify({type:"interrupt",questionId,turnId}));stopPlayback();},[questionId,stopPlayback]);

  useEffect(()=>()=>{void stop();socketRef.current?.close();stopPlayback();void playbackContextRef.current?.close();},[stop,stopPlayback]);
  return{connected,recording,speaking,stage,partial,connect,start,stop,interrupt};
}
