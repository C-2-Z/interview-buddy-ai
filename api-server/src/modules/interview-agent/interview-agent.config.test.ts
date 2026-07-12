/** Interview Agent 环境配置解析与默认关闭策略的单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { getAgentRuntimeConfig } from "./interview-agent.config.js";

/** 在测试结束时恢复被覆盖的环境变量，避免同进程用例互相污染。 */
function restoreEnvironment(
  name: string,
  originalValue: string | undefined,
): void {
  if (originalValue === undefined) delete process.env[name];
  else process.env[name] = originalValue;
}

test("Agent creation is disabled by default", () => {
  const original = process.env.AGENT_INTERVIEW_ENABLED;
  delete process.env.AGENT_INTERVIEW_ENABLED;
  try {
    assert.equal(getAgentRuntimeConfig().enabled, false);
  } finally {
    restoreEnvironment("AGENT_INTERVIEW_ENABLED", original);
  }
});

test("Agent runtime config accepts explicit bounded values", () => {
  const names = [
    "AGENT_INTERVIEW_ENABLED",
    "AGENT_PROMPT_VERSION",
    "AGENT_WEB_RESEARCH_ENABLED",
    "AGENT_EVENT_RETENTION_DAYS",
    "AGENT_MAX_NODE_RETRIES",
    "AGENT_WEB_RESEARCH_TIMEOUT_MS",
  ] as const;
  const originals = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  Object.assign(process.env, {
    AGENT_INTERVIEW_ENABLED: "1",
    AGENT_PROMPT_VERSION: "agent-v1-test",
    AGENT_WEB_RESEARCH_ENABLED: "0",
    AGENT_EVENT_RETENTION_DAYS: "30",
    AGENT_MAX_NODE_RETRIES: "3",
    AGENT_WEB_RESEARCH_TIMEOUT_MS: "2500",
  });

  try {
    assert.deepEqual(getAgentRuntimeConfig(), {
      enabled: true,
      promptVersion: "agent-v1-test",
      webResearchEnabled: false,
      eventRetentionDays: 30,
      maxNodeRetries: 3,
      webResearchTimeoutMs: 2500,
    });
  } finally {
    for (const name of names) restoreEnvironment(name, originals[name]);
  }
});

test("out-of-range numeric configuration is rejected", () => {
  const original = process.env.AGENT_MAX_NODE_RETRIES;
  process.env.AGENT_MAX_NODE_RETRIES = "99";
  try {
    assert.throws(() => getAgentRuntimeConfig());
  } finally {
    restoreEnvironment("AGENT_MAX_NODE_RETRIES", original);
  }
});
