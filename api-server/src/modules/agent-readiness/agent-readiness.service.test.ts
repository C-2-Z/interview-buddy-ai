/** Agent readiness service 的阻断、降级与恢复动作单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { AgentReadinessRepository } from "./agent-readiness.repository.js";
import { hasRequiredAgentRpcs } from "./agent-readiness.repository.js";
import {
  AgentReadinessService,
  type AgentReadinessServiceDependencies,
} from "./agent-readiness.service.js";

/** 创建可按场景覆盖的安全默认依赖。 */
function dependencies(
  overrides: Partial<AgentReadinessServiceDependencies> = {},
): AgentReadinessServiceDependencies {
  return {
    nodeEnv: "production",
    hasDatabaseUrl: true,
    allowMemoryCheckpointer: false,
    webResearchProviderAvailable: true,
    voiceMockEnabled: false,
    hasVoiceApiKey: true,
    hasAsrEndpoint: true,
    hasTtsEndpoint: true,
    runtimeConfig: {
      enabled: true,
      promptVersion: "agent-v1",
      webResearchEnabled: true,
      eventRetentionDays: 90,
      maxNodeRetries: 2,
      webResearchTimeoutMs: 10_000,
    },
    async resolveModel(provider) {
      return { name: provider ?? "deepseek", apiKey: "configured" };
    },
    ...overrides,
  };
}

/** 创建不接触真实数据库的 service。 */
function service(
  input: {
    agentDatabaseReady?: boolean;
    checkpointSchemaReady?: boolean;
    dependencies?: Partial<AgentReadinessServiceDependencies>;
  } = {},
): AgentReadinessService {
  const repository = new AgentReadinessRepository({
    async checkAgentDatabase() {
      return input.agentDatabaseReady ?? true;
    },
    async checkCheckpointSchema() {
      return input.checkpointSchemaReady ?? true;
    },
  });
  return new AgentReadinessService(repository, dependencies(input.dependencies));
}

test("关闭 Agent 开关时 blocked 并建议联系管理员", async () => {
  const result = await service({
    dependencies: { runtimeConfig: { ...dependencies().runtimeConfig, enabled: false } },
  }).check({ interviewMode: "text", modelProvider: "deepseek", webResearch: false });
  assert.equal(result.status, "blocked");
  assert.deepEqual(
    result.blockers.map((item) => item.code),
    ["agent_disabled"],
  );
  assert.equal(result.blockers[0]?.recoveryAction, "contact_admin");
});
test("模型 Key 缺失时 blocked 并引导设置", async () => {
  const result = await service({
    dependencies: {
      async resolveModel() {
        return { name: "openai" };
      },
    },
  }).check({ interviewMode: "text", modelProvider: "openai", webResearch: false });
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.at(-1)?.code, "model_key_missing");
  assert.equal(result.blockers.at(-1)?.recoveryAction, "open_settings");
});
test("缺少任何联网研究通道时仅在启用研究时 degraded", async () => {
  const result = await service({ dependencies: { webResearchProviderAvailable: false } }).check({
    interviewMode: "text",
    modelProvider: "deepseek",
    webResearch: true,
  });
  assert.equal(result.status, "degraded");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.warnings[0]?.recoveryAction, "disable_research");
});
test("ASR 与 TTS 分别检查且仅阻断 voice", async () => {
  const unavailable = { hasVoiceApiKey: false, hasAsrEndpoint: false, hasTtsEndpoint: false };
  const voice = await service({ dependencies: unavailable }).check({
    interviewMode: "voice",
    modelProvider: "deepseek",
    webResearch: false,
  });
  assert.equal(voice.status, "blocked");
  assert.deepEqual(
    voice.blockers.slice(-2).map((item) => item.code),
    ["voice_asr_unavailable", "voice_tts_unavailable"],
  );
  assert.equal(voice.capabilities.voiceRecognition.status, "blocked");
  assert.equal(voice.capabilities.voiceSynthesis.status, "blocked");
  const text = await service({ dependencies: unavailable }).check({
    interviewMode: "text",
    modelProvider: "deepseek",
    webResearch: false,
  });
  assert.equal(
    text.blockers.some((item) => item.code.startsWith("voice_")),
    false,
  );
});
test("显式本地 MemorySaver degraded 且生产无 DATABASE_URL blocked", async () => {
  const local = await service({
    dependencies: { nodeEnv: "development", hasDatabaseUrl: false, allowMemoryCheckpointer: true },
  }).check({ interviewMode: "text", modelProvider: "deepseek", webResearch: false });
  assert.equal(local.status, "degraded");
  assert.equal(local.checkpointMode, "ephemeral");
  assert.equal(local.warnings[0]?.code, "checkpoint_ephemeral");
  const production = await service({
    dependencies: { nodeEnv: "production", hasDatabaseUrl: false, allowMemoryCheckpointer: true },
  }).check({ interviewMode: "text", modelProvider: "deepseek", webResearch: false });
  assert.equal(production.status, "blocked");
  assert.equal(production.checkpointMode, "unavailable");
});
test("迁移或 checkpoint schema 缺失时仅返回稳定阻断码", async () => {
  const result = await service({ agentDatabaseReady: false, checkpointSchemaReady: false }).check({
    interviewMode: "text",
    modelProvider: "deepseek",
    webResearch: false,
  });
  assert.deepEqual(
    result.blockers.map((item) => item.code),
    ["checkpoint_schema_unavailable", "agent_database_unavailable"],
  );
  assert.equal(JSON.stringify(result).includes("password"), false);
});
test("legacy OpenAPI fallback requires every Canonical Agent RPC", () => {
  const required = [
    "create_agent_interview_session",
    "commit_agent_preparation",
    "accept_agent_input",
    "commit_agent_question_evaluation",
    "finalize_agent_report",
    "record_agent_run",
  ];
  const complete = { paths: Object.fromEntries(required.map((name) => [`/rpc/${name}`, {}])) };
  assert.equal(hasRequiredAgentRpcs(complete), true);
  delete complete.paths["/rpc/record_agent_run"];
  assert.equal(hasRequiredAgentRpcs(complete), false);
  assert.equal(hasRequiredAgentRpcs({ error: "raw database error" }), false);
});
