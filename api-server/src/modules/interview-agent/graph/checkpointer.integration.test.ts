/** PostgreSQL checkpointer 跨实例 interrupt/resume 恢复集成测试。 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { createPostgresCheckpointer } from "./checkpointer.js";
import {
  compileInterviewAgentGraph,
  createAgentGraphConfig,
  createAgentResumeCommand,
  createInitialAgentState,
} from "./interview-agent.graph.js";

// 本地一键基础设施可直接承担隔离线程测试；CI 仍必须显式授权测试数据库。
const testDatabaseUrl = process.env.AGENT_TEST_DATABASE_URL?.trim();

test(
  "PostgresSaver resumes an interrupted Agent after saver reconstruction",
  {
    skip: testDatabaseUrl
      ? false
      : "AGENT_TEST_DATABASE_URL is not configured and local DATABASE_URL is unavailable",
  },
  async () => {
    const sessionId = randomUUID();
    const config = createAgentGraphConfig(sessionId);
    const firstCheckpointer = createPostgresCheckpointer({
      connectionString: testDatabaseUrl,
    });
    let firstCheckpointerEnded = false;
    let resumedCheckpointer:
      | ReturnType<typeof createPostgresCheckpointer>
      | undefined;

    try {
      // 集成环境显式 setup 一次；后续运行时重建不得再次隐式执行 DDL。
      await (firstCheckpointer as any).setup();
      const firstGraph = compileInterviewAgentGraph({
        checkpointer: firstCheckpointer,
      });
      const interruptedResult = await firstGraph.invoke(
        createInitialAgentState({
          sessionId,
          userId: randomUUID(),
          preparedQuestionId: randomUUID(),
          input: {
            mode: "single",
      interviewMode: "text",
      experienceMode: "coaching",
            position: "后端工程师",
            difficulty: "中级",
            questionCount: 3,
            webResearch: false,
          },
          promptVersion: "agent-v3",
          webResearchEnabled: false,
        }),
        config,
      );
      assert.equal(isInterrupted(interruptedResult), true);
      if (!isInterrupted(interruptedResult)) {
        throw new Error("Expected PostgreSQL graph run to interrupt");
      }
      assert.equal(interruptedResult[INTERRUPT].length, 1);

      const interruptedState = await firstGraph.getState(config);
      assert.equal(interruptedState.values.phase, "awaiting_answer");
      assert.deepEqual(interruptedState.next, ["wait_for_input"]);

      // 模拟 API/Worker 进程结束：关闭旧 pool，再用全新 saver 与 compiled graph 恢复。
      await (firstCheckpointer as any).end();
      firstCheckpointerEnded = true;
      resumedCheckpointer = createPostgresCheckpointer({
        connectionString: testDatabaseUrl,
      });
      const resumedGraph = compileInterviewAgentGraph({
        checkpointer: resumedCheckpointer,
      });
      const completedState = await resumedGraph.invoke(
        createAgentResumeCommand("postgres-resume-input"),
        config,
      );

      assert.equal(completedState.phase, "completed");
      assert.equal(completedState.latestInputId, "postgres-resume-input");
      assert.deepEqual((await resumedGraph.getState(config)).next, []);

      await resumedCheckpointer.deleteThread(sessionId);
    } finally {
      if (!firstCheckpointerEnded) {
        await (firstCheckpointer as any).end();
      }
      if (resumedCheckpointer) {
        // deleteThread 可幂等清理断言前失败留下的测试线程，再关闭重建后的 pool。
        await resumedCheckpointer.deleteThread(sessionId);
        await (resumedCheckpointer as any).end();
      }
    }
  },
);
