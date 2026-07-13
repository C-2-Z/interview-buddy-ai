/** Agent readiness 模块的创建前业务规则与安全恢复建议。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { resolveProviderForCreation } from "../model-providers/model-provider.service.js";
import { getAgentRuntimeConfig } from "../interview-agent/interview-agent.config.js";
import type { AgentReadinessQuery } from "./agent-readiness.schemas.js";
import type { AgentReadinessRepository } from "./agent-readiness.repository.js";
import type { AgentReadinessResponse, ReadinessIssue } from "./agent-readiness.types.js";

/** readiness 服务依赖，避免测试读取真实环境或用户设置。 */
export type AgentReadinessServiceDependencies = {
  /** 当前 Node 环境。 */ nodeEnv: string | undefined;
  /** 是否配置 PostgreSQL checkpoint 连接。 */ hasDatabaseUrl: boolean;
  /** 是否显式允许本地 MemorySaver。 */ allowMemoryCheckpointer: boolean;
  /** 是否存在 Tavily 凭据。 */ hasTavilyKey: boolean;
  /** voice mock 是否显式启用。 */ voiceMockEnabled: boolean;
  /** 读取功能开关和联网研究总开关。 */ runtimeConfig: ReturnType<typeof getAgentRuntimeConfig>;
  /** 解析用户实际模型与解密后的 Key。 */ resolveModel(provider?: AgentReadinessQuery["modelProvider"]): Promise<{name:"deepseek"|"openai"|"anthropic";apiKey?:string}>;
};

/** 将基础设施与用户方案聚合为唯一 readiness 结论。 */
export class AgentReadinessService {
  /** @param repository - 只读数据库检查；@param dependencies - 配置与模型检查。 */
  constructor(private readonly repository: AgentReadinessRepository, private readonly dependencies: AgentReadinessServiceDependencies) {}

  /**
   * 在创建请求之前检查当前用户所选方案，并生成稳定恢复动作。
   *
   * @param input - 交互方式、模型和联网研究选择。
   * @returns 可直接展示且不包含敏感数据的 readiness 响应。
   */
  async check(input: AgentReadinessQuery): Promise<AgentReadinessResponse> {
    const blockers: ReadinessIssue[] = [];
    const warnings: ReadinessIssue[] = [];
    const production = this.dependencies.nodeEnv === "production";
    const ephemeral = !production && !this.dependencies.hasDatabaseUrl && this.dependencies.allowMemoryCheckpointer;
    const checkpointMode = this.dependencies.hasDatabaseUrl ? "durable" : ephemeral ? "ephemeral" : "unavailable";
    const infrastructure = ephemeral
      ? { agentDatabaseReady: await this.repository.inspectInfrastructure().then((value) => value.agentDatabaseReady), checkpointSchemaReady: true }
      : await this.repository.inspectInfrastructure();

    if (!this.dependencies.runtimeConfig.enabled) blockers.push({code:"agent_disabled",message:"模拟面试服务尚未启用，请联系管理员。",recoveryAction:"contact_admin"});
    if (checkpointMode === "unavailable") blockers.push({code:"checkpoint_unavailable",message:"面试恢复服务尚未配置，请联系管理员。",recoveryAction:"contact_admin"});
    if (checkpointMode === "durable" && !infrastructure.checkpointSchemaReady) blockers.push({code:"checkpoint_schema_unavailable",message:"面试恢复服务尚未初始化，请联系管理员。",recoveryAction:"contact_admin"});
    if (!infrastructure.agentDatabaseReady) blockers.push({code:"agent_database_unavailable",message:"面试数据服务尚未完成升级，请联系管理员。",recoveryAction:"contact_admin"});
    if (ephemeral) warnings.push({code:"checkpoint_ephemeral",message:"当前为本地临时恢复模式，服务重启后进行中的面试无法继续。",recoveryAction:"retry"});

    const model = await this.dependencies.resolveModel(input.modelProvider);
    if (!model.apiKey?.trim()) blockers.push({code:"model_key_missing",message:"所选 AI 服务尚未配置，请先前往设置添加 API Key。",recoveryAction:"open_settings"});

    const voiceAvailable = this.dependencies.voiceMockEnabled || Boolean(model.apiKey?.trim());
    const voiceIssue = !voiceAvailable ? {code:"voice_unavailable",message:"语音识别与播报尚未配置，可切换文本模式继续。",recoveryAction:"use_text"} as const : null;
    if (input.interviewMode === "voice" && voiceIssue) blockers.push(voiceIssue);

    const researchAvailable = this.dependencies.runtimeConfig.webResearchEnabled && this.dependencies.hasTavilyKey;
    if (input.webResearch && !researchAvailable) warnings.push({code:"web_research_unavailable",message:"联网研究暂不可用，可关闭联网研究后使用岗位描述和题库继续。",recoveryAction:"disable_research"});

    return {
      status: blockers.length ? "blocked" : warnings.length ? "degraded" : "ready",
      checkpointMode,
      capabilities: {
        text: {status: blockers.some((item) => item.code !== "voice_unavailable") ? "blocked" : warnings.length ? "degraded" : "ready", message: blockers.length ? "文本面试需要先完成必要设置。" : "文本面试可以开始。"},
        voice: voiceIssue ? {status:"blocked",message:voiceIssue.message} : {status:"ready",message:"语音识别与播报已配置。"},
        webResearch: researchAvailable ? {status:"ready",message:"联网研究可以使用。"} : {status:"degraded",message:"将使用岗位描述、简历和题库继续。"},
      },
      blockers,
      warnings,
      effectiveModelProvider: model.name,
    };
  }
}

/**
 * 创建绑定当前用户和进程配置的 readiness 服务。
 *
 * @param supabase - 当前用户数据库客户端。
 * @param userId - 当前用户 UUID。
 * @param repository - readiness 数据访问实例。
 * @returns 可执行创建前检查的服务。
 */
export function createAgentReadinessService(supabase:UserSupabaseClient,userId:string,repository:AgentReadinessRepository):AgentReadinessService {
  return new AgentReadinessService(repository,{
    nodeEnv:process.env.NODE_ENV,
    hasDatabaseUrl:Boolean(process.env.DATABASE_URL?.trim()),
    allowMemoryCheckpointer:process.env.AGENT_ALLOW_MEMORY_CHECKPOINTER === "1",
    hasTavilyKey:Boolean(process.env.TAVILY_API_KEY?.trim()),
    voiceMockEnabled:process.env.VOICE_MOCK_QWEN === "1",
    runtimeConfig:getAgentRuntimeConfig(),
    async resolveModel(provider){const model=await resolveProviderForCreation(supabase,userId,{modelProvider:provider});return {name:model.name,apiKey:model.apiKey};},
  });
}
