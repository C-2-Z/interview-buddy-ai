/** Interview lifecycle Service tests：验证终态 checkpoint 清理和稳定错误边界。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  InterviewLifecycleService,
  InterviewLifecycleServiceError,
} from "./interview-lifecycle.service.js";
import type { InterviewLifecycleRepository } from "./interview-lifecycle.repository.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

/** 创建满足 Service 依赖的最小 Repository fake。 */
function createRepository(
  overrides: Partial<InterviewLifecycleRepository> = {},
): InterviewLifecycleRepository {
  return {
    async transition(sessionId, action) {
      return {
        sessionId,
        status:
          action === "finish"
            ? "completed"
            : action === "abandon"
              ? "abandoned"
              : action === "pause"
                ? "paused"
                : "in_progress",
        reportAvailable: action === "finish",
        evaluatedQuestionCount: 1,
        totalQuestionCount: 3,
      };
    },
    async deleteSession(sessionId) {
      return { sessionId, threadId: sessionId, deleted: true };
    },
    ...overrides,
  } as InterviewLifecycleRepository;
}

test("finish commits partial report and clears checkpoint", async () => {
  const cleared: string[] = [];
  const service = new InterviewLifecycleService({
    repository: createRepository(),
    async deleteCheckpoint(threadId) {
      cleared.push(threadId);
    },
  });
  const result = await service.transition(SESSION_ID, "finish");
  assert.equal(result.status, "completed");
  assert.equal(result.reportAvailable, true);
  assert.deepEqual(cleared, [SESSION_ID]);
});

test("pause keeps checkpoint for later resume", async () => {
  const cleared: string[] = [];
  const service = new InterviewLifecycleService({
    repository: createRepository(),
    async deleteCheckpoint(threadId) {
      cleared.push(threadId);
    },
  });
  const result = await service.transition(SESSION_ID, "pause");
  assert.equal(result.status, "paused");
  assert.deepEqual(cleared, []);
});

test("repository errors become stable recovery errors", async () => {
  const service = new InterviewLifecycleService({
    repository: createRepository({
      async transition() {
        throw new Error("raw database password and stack");
      },
    }),
  });
  await assert.rejects(
    service.transition(SESSION_ID, "resume"),
    (error: unknown) =>
      error instanceof InterviewLifecycleServiceError &&
      error.code === "lifecycle_transition_failed" &&
      !error.message.includes("password"),
  );
});
