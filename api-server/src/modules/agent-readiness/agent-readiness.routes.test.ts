/** Agent readiness 路由的鉴权与公开错误边界测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import app from "../../app.js";

test("readiness route requires authentication before infrastructure checks", async () => {
  const response = await app.request("/api/agent/readiness?interviewMode=text&webResearch=true");
  assert.equal(response.status, 401);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(body, { error: "未提供认证凭证" });
  assert.equal(JSON.stringify(body).includes("DATABASE_URL"), false);
});
