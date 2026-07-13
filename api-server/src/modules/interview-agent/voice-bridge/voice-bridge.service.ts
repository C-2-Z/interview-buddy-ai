/** Agent 语音桥：用稳定 turnId 恢复同一 Graph，并返回本次新提交的持久事件。 */
import type { AgentEvent, AgentInputResponse, AgentSnapshot } from "../interview-agent.types.js";
import type { AgentInput } from "../interview-agent.schemas.js";
import type { VoiceProvider } from "../providers/voice.provider.js";
import { createModuleLogger } from "../../../shared/logger/voice-logger.js";

const logger = createModuleLogger("agent-voice-bridge");
const EVENT_PAGE_SIZE = 250;

/** 语音桥依赖的最小 Agent Service 端口。 */
export interface AgentVoiceServicePort {
  /** 读取提交前后的持久快照水位。 */
  getSession(sessionId: string): Promise<{ snapshot: AgentSnapshot }>;
  /** 语音与文本共用同一个 Graph 恢复方法，仅持久化 source 不同。 */
  submitInput(
    sessionId: string,
    input: AgentInput,
    source?: "text" | "voice",
  ): Promise<AgentInputResponse>;
  /** 通知 Agent 当前输出被用户打断。 */
  interruptSession(sessionId: string): Promise<unknown>;
}

/** 语音桥只读取数据库已提交事件，不读取模型临时输出。 */
export interface AgentVoiceEventReader {
  /** 按 sequence 升序读取游标后的事件。 */
  listEventsAfter(sessionId: string, afterSequence: number, limit: number): Promise<AgentEvent[]>;
}

/** 一次 ASR 转录恢复后的确定性结果。 */
export type VoiceBridgeResult = Readonly<{
  /** Graph 提交后的最新快照。 */
  snapshot: AgentSnapshot;
  /** 与客户端 turnId 一一对应的幂等输入标识。 */
  inputId: string;
  /** 本次操作新增的持久事件；重放时为空，防止重复播报。 */
  events: AgentEvent[];
  /** true 表示同一 turn 已经成功处理过。 */
  duplicate: boolean;
}>;

/** 语音桥可替换依赖。 */
export type VoiceBridgeDependencies = Readonly<{
  /** Canonical Agent Service。 */
  agentService: AgentVoiceServicePort;
  /** Agent 事件真相源。 */
  eventReader: AgentVoiceEventReader;
  /** ASR/TTS Provider，仅用于统一打断生命周期。 */
  voiceProvider: VoiceProvider;
}>;

/** 将客户端 turnId 变为数据库允许的稳定 inputId。 */
function voiceInputId(turnId: string): string {
  const normalized = turnId.trim();
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(normalized)) {
    throw new Error("Voice turn id is invalid");
  }
  return `voice:${normalized}`;
}

/** 读取直到目标快照水位，避免一次操作跨越多页时漏播事件。 */
async function readCommittedEvents(
  reader: AgentVoiceEventReader,
  sessionId: string,
  afterSequence: number,
  targetSequence: number,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  let cursor = afterSequence;
  while (cursor < targetSequence) {
    const page = await reader.listEventsAfter(sessionId, cursor, EVENT_PAGE_SIZE);
    if (page.length === 0) break;
    for (const event of page) {
      if (event.sequence <= targetSequence) events.push(event);
      cursor = Math.max(cursor, event.sequence);
    }
    if (page.length < EVENT_PAGE_SIZE) break;
  }
  return events;
}

/** ASR 与 Agent 持久事件之间的无状态协调服务。 */
export class AgentVoiceBridgeService {
  /** @param dependencies - Agent、事件读取器和 VoiceProvider。 */
  constructor(private readonly dependencies: VoiceBridgeDependencies) {}

  /**
   * 将 ASR 文本作为 voice 来源提交；相同 turnId 重放不会二次推进或二次播报。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param turnId - 客户端在断线重试时保持不变的语音轮次 ID。
   * @param transcript - ASR 最终文本。
   * @returns 最新快照和本次新增的持久事件。
   */
  async submitVoiceInput(
    sessionId: string,
    turnId: string,
    transcript: string,
  ): Promise<VoiceBridgeResult> {
    const content = transcript.trim();
    if (!content) throw new Error("Voice transcript is empty");
    const inputId = voiceInputId(turnId);
    const before = await this.dependencies.agentService.getSession(sessionId);
    const result = await this.dependencies.agentService.submitInput(
      sessionId,
      { inputId, type: "text", content },
      "voice",
    );
    const events = result.duplicate
      ? []
      : await readCommittedEvents(
          this.dependencies.eventReader,
          sessionId,
          before.snapshot.eventCursor,
          result.snapshot.eventCursor,
        );
    logger.info("agent_voice_input_committed", {
      sessionId,
      inputId,
      duplicate: result.duplicate,
      eventCount: events.length,
    });
    return {
      snapshot: result.snapshot,
      inputId,
      events,
      duplicate: result.duplicate,
    };
  }

  /**
   * 同时取消 Agent 输出语义和 Provider 音频流。
   *
   * @param sessionId - Agent 会话 UUID。
   * @param turnId - 正在播放的轮次 ID。
   */
  async interruptVoiceOutput(sessionId: string, turnId: string): Promise<void> {
    await Promise.allSettled([
      this.dependencies.agentService.interruptSession(sessionId),
      this.dependencies.voiceProvider.interrupt(turnId),
    ]);
  }
}

/** 创建生产或测试可注入的语音桥。 */
export function createAgentVoiceBridgeService(
  dependencies: VoiceBridgeDependencies,
): AgentVoiceBridgeService {
  return new AgentVoiceBridgeService(dependencies);
}
