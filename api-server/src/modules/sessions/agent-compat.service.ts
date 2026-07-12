/** 旧 Sessions 创建接口到 Canonical Interview Agent 的功能开关兼容适配。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { getAgentRuntimeConfig } from "../interview-agent/interview-agent.config.js";
import { createInterviewAgentService } from "../interview-agent/interview-agent.service.js";
import type { CreateAgentSessionResponse } from "../interview-agent/interview-agent.types.js";
import { createInterviewSession } from "./sessions.service.js";
import type { CreateSessionInput } from "./session.types.js";

/** 兼容创建服务输入。 */
export type CompatibleSessionCreateInput = {
  /** 当前用户 Supabase client。 */
  supabase: UserSupabaseClient;
  /** 已鉴权用户 UUID。 */
  userId: string;
  /** 旧接口已校验请求。 */
  input: CreateSessionInput;
};

/** 兼容适配器的测试替换依赖。 */
export type CompatibleSessionCreateDependencies = {
  /** 覆盖功能开关。 */
  agentEnabled?: boolean;
  /** 覆盖旧创建函数。 */
  createLegacy?: typeof createInterviewSession;
  /** 覆盖 Agent 服务工厂。 */
  createAgentService?: typeof createInterviewAgentService;
};

/**
 * Agent 开关开启时委托 Canonical API 业务服务，否则保留旧创建路径用于灰度回滚。
 *
 * 旧请求中的 inline `userApiKey` 和 `resumeText` 不进入 Agent：Agent 只从加密用户设置解析
 * BYOK，并只通过 resumeId 加载有限摘要。旧题型配额由能力蓝图取代。
 *
 * @param params - 用户作用域数据库、用户 ID 和旧创建请求。
 * @returns 旧或 Agent 创建响应；调用方统一使用 sessionId。
 */
export async function createCompatibleInterviewSession(
  params: CompatibleSessionCreateInput,
  dependencies: CompatibleSessionCreateDependencies = {},
): Promise<{ sessionId: string } | CreateAgentSessionResponse> {
  const enabled = dependencies.agentEnabled ?? getAgentRuntimeConfig().enabled;
  if (!enabled) {
    return (dependencies.createLegacy ?? createInterviewSession)({
      ...params,
      input: { ...params.input, interviewMode: "text" },
    });
  }
  const service = (dependencies.createAgentService ?? createInterviewAgentService)(
    params.supabase,
    params.userId,
  );
  return service.createSession({
    mode: "single",
    interviewMode: "text",
    position: params.input.position,
    difficulty: params.input.difficulty,
    questionCount: params.input.questionCount,
    jobDescription: params.input.jobDescription || undefined,
    targetCompany: params.input.targetCompany || undefined,
    skillId: params.input.skillId,
    resumeId: params.input.resumeId,
    modelProvider: params.input.modelProvider,
    modelName: params.input.modelName,
    webResearch: true,
  });
}
