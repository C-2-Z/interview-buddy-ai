/** 知识库：Embedding 服务 — 调用 Alibaba Cloud Bailian (DashScope) text-embedding-v3 生成向量（1024维） */

import { createModuleLogger } from "../voice/voice-logger.js";

const logger = createModuleLogger("knowledge-embedding");

const EMBEDDING_MODEL = "text-embedding-v3";
const EMBEDDING_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";
const EMBEDDING_DIMENSIONS = 1024;

/** 获取 Embedding API Key（使用 Alibaba Cloud Bailian API Key）
 *  该 Key 与语音模块共享，统一配置在 AI_BAILIAN_API_KEY 环境变量中 */
function getEmbeddingApiKey(): string {
  const key = process.env.AI_BAILIAN_API_KEY?.trim();
  if (!key) {
    throw new Error("Bailian API Key (AI_BAILIAN_API_KEY) 未配置，无法生成 Embedding。请在 .env 中配置 AI_BAILIAN_API_KEY。");
  }
  return key;
}

/** 调用 Bailian (DashScope) Embedding API 生成单个文本的向量 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = getEmbeddingApiKey();
  const url = EMBEDDING_URL;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error("Embedding 请求过于频繁，请稍后重试");
    }
    throw new Error(`Embedding API 调用失败: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const rawData = data.data as Array<Record<string, unknown>> | undefined;
  if (!rawData || rawData.length === 0) {
    throw new Error("Embedding API 未返回数据");
  }

  const embedding = rawData[0].embedding as number[] | undefined;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding 维度异常: 期望 ${EMBEDDING_DIMENSIONS}, 实际 ${embedding?.length ?? 0}`);
  }

  return embedding;
}

/** 批量生成 Embedding（调用 Bailian text-embedding-v3，每批最多 10 条） */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = getEmbeddingApiKey();
  const url = EMBEDDING_URL;
  const batchSize = 10;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`批量 Embedding 调用失败: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const rawData = data.data as Array<Record<string, unknown>> | undefined;
    if (!rawData) {
      throw new Error("批量 Embedding API 未返回数据");
    }

    // Bailian / OpenAI 兼容 API 返回的 data 顺序与 input 顺序一致
    const sorted = rawData
      .sort((a, b) => (a.index as number) - (b.index as number))
      .map((item) => item.embedding as number[]);
    allEmbeddings.push(...sorted);

    logger.info(`Embedding 批次完成: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
  }

  return allEmbeddings;
}

/** 生成查询的 embedding（QA 搜索时用，复用 text-embedding-v3） */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  // 对于查询，直接调用单条 embedding API
  return generateEmbedding(query);
}
