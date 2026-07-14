/** Agent Memory Service 单元测试：验证主动授权、聚合和撤权边界。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMemoryRepository } from "./agent-memory.repository.js";
import { AgentMemoryService } from "./agent-memory.service.js";
import type { AgentMemoryView, AgentTrainingSummary } from "./agent-memory.types.js";

/** 创建可观察的内存 Repository，模拟读取时即时撤权。 */
function createRepository(initial: AgentMemoryView) {
  let value = initial;
  const saved: AgentTrainingSummary[] = [];
  const repository: AgentMemoryRepository = {
    async get() { return value; },
    async setEnabled(_userId, enabled) { value = { ...value, enabled }; return value; },
    async clear() { value = { ...value, summary: null }; return value; },
    async saveSummary(_userId, summary) { saved.push(summary); value = { ...value, summary }; },
  };
  return { repository, saved, setValue(next: AgentMemoryView) { value = next; } };
}

test("disabled memory never consumes a report", async () => {
  const fake = createRepository({ enabled: false, summary: null, updatedAt: null });
  const service = new AgentMemoryService(fake.repository);
  assert.equal(await service.mergeReport("user", { dimensions: { communication: { score: 60 } } }), false);
  assert.equal(fake.saved.length, 0);
});

test("enabled memory stores only aggregate dimensions and recurring weaknesses", async () => {
  const fake = createRepository({
    enabled: true,
    updatedAt: null,
    summary: {
      dimensions: { communication: { score: 60, sampleCount: 1 } },
      recurringWeaknesses: [],
      suggestedFocus: ["communication"],
      completedSessionCount: 1,
    },
  });
  const service = new AgentMemoryService(fake.repository);
  assert.equal(await service.mergeReport("user", {
    dimensions: { communication: { score: 70 }, technical_depth: { score: 82 } },
  }), true);
  assert.deepEqual(fake.saved[0], {
    dimensions: {
      communication: { score: 65, sampleCount: 2 },
      technical_depth: { score: 82, sampleCount: 1 },
    },
    recurringWeaknesses: ["communication"],
    suggestedFocus: ["communication", "technical_depth"],
    completedSessionCount: 2,
  });
  assert.equal(JSON.stringify(fake.saved[0]).includes("answer"), false);
});

test("revoked memory stops writes immediately", async () => {
  const fake = createRepository({ enabled: true, summary: null, updatedAt: null });
  const service = new AgentMemoryService(fake.repository);
  fake.setValue({ enabled: false, summary: null, updatedAt: null });
  assert.equal(await service.mergeReport("user", { dimensions: { evidence: { score: 90 } } }), false);
});
