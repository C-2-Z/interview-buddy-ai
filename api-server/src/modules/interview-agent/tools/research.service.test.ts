/** 固定研究查询、缓存、无 Key 和失败降级测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import type { WebSearchProvider } from "../providers/web-search.provider.js";
import { DisabledWebSearchProvider } from "../providers/web-search.provider.js";
import {
  buildResearchQueries,
  conductPreInterviewResearch,
} from "./research.service.js";

test("query plan uses only fixed company, role and industry categories", () => {
  assert.deepEqual(
    buildResearchQueries("后端工程师", "示例公司", 2026).map(
      (query) => query.category,
    ),
    ["company", "role", "industry"],
  );
  assert.deepEqual(
    buildResearchQueries("后端工程师", null, 2026).map(
      (query) => query.category,
    ),
    ["role", "industry"],
  );
});

test("missing Tavily key skips research but does not fail preparation", async () => {
  const result = await conductPreInterviewResearch(
    new DisabledWebSearchProvider(),
    {
      enabled: true,
      position: "后端工程师",
      targetCompany: null,
      cachedSources: [],
      currentYear: 2026,
    },
  );
  assert.deepEqual(result, { status: "skipped", sources: [] });
});

test("cached categories are not searched again", async () => {
  const calls: string[] = [];
  const provider: WebSearchProvider = {
    available: true,
    async search(input) {
      calls.push(input.query);
      return [];
    },
  };
  const cached = {
    category: "role" as const,
    query: "cached",
    title: "cached",
    url: "https://example.com/",
    snippet: "cached fact",
    fetchedAt: "2026-07-12T00:00:00.000Z",
    contentHash: "a".repeat(64),
  };
  const result = await conductPreInterviewResearch(provider, {
    enabled: true,
    position: "后端工程师",
    targetCompany: null,
    cachedSources: [cached],
    currentYear: 2026,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /近期变化/);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.sources, [cached]);
});

test("all provider failures degrade to failed with an empty source list", async () => {
  const provider: WebSearchProvider = {
    available: true,
    async search() {
      throw new Error("external failure must not escape");
    },
  };
  const result = await conductPreInterviewResearch(provider, {
    enabled: true,
    position: "后端工程师",
    targetCompany: "示例公司",
    cachedSources: [],
    currentYear: 2026,
  });
  assert.deepEqual(result, { status: "failed", sources: [] });
});
