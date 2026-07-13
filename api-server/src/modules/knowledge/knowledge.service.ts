/** 知识库模块：业务流程编排 — 文档上传、解析、分块、向量化、图谱构建 */

import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { createModuleLogger } from "../../shared/logger/voice-logger.js";
import { processorRegistry } from "./processor/index.js";
import { splitText } from "./splitter/index.js";
import { generateEmbeddings } from "./embedding.service.js";
import { autoAssignToDefaultBrain } from "./brain/brain.service.js";
import {
  createDocument,
  updateDocumentStatus,
  listDocuments,
  deleteDocument,
  insertChunks,
} from "./knowledge.repository.js";
import { buildGraphEdgesForDocument } from "./graph.service.js";
import type { KnowledgeDocument, DocFileType } from "./knowledge.types.js";

const logger = createModuleLogger("knowledge-service");

/** 上传并处理文档全流程：
 *  1. 创建文档记录（status=processing）
 *  2. 解析文件为纯文本
 *  3. 分块
 *  4. 生成 embedding
 *  5. 存储 chunks
 *  6. 更新文档状态
 *  7. 构建图边（反链）
 *  @returns 文档 ID */
export async function processDocumentUpload(
  supabase: UserSupabaseClient,
  userId: string,
  input: {
    title?: string;
    content: string | Buffer;
    fileName?: string;
    fileType: DocFileType;
    fileSize?: number;
    fileHash?: string;
  },
): Promise<string> {
  const { title: rawTitle, content: parsedContent } = await processorRegistry.process(
    input.content,
    input.fileType,
    { fileName: input.fileName },
  );

  const title = input.title ?? rawTitle;

  // 1. 创建文档记录
  const docId = await createDocument(supabase, userId, {
    title,
    fileName: input.fileName ?? null,
    fileType: input.fileType,
    fileSize: input.fileSize ?? null,
    fileHash: input.fileHash ?? null,
    source: "upload",
    status: "processing",
  });
  logger.info("文档记录已创建", { documentId: docId });

  try {
    // 2. 分块
    const chunks = splitText(parsedContent);
    logger.info(`文档分块完成: ${chunks.length} 块`);

    if (chunks.length === 0) {
      await updateDocumentStatus(supabase, docId, "ready", { chunkCount: 0 });
      return docId;
    }

    // 3. 生成 embedding
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);
    logger.info(`Embedding 生成完成: ${embeddings.length} 个`);

    // 4. 存储 chunks
    const chunkRows = chunks.map((chunk, i) => ({
      documentId: docId,
      userId,
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: embeddings[i],
    }));
    await insertChunks(supabase, chunkRows);
    logger.info(`Chunks 已入库: ${chunkRows.length} 条`);

    // 5. 更新文档状态
    await updateDocumentStatus(supabase, docId, "ready", {
      chunkCount: chunks.length,
    });

    // 6. 构建图边（不阻塞主流程，但如果失败也不影响文档已上传）
    try {
      const edgeCount = await buildGraphEdgesForDocument(supabase, userId, docId);
      logger.info(`图边构建完成: ${edgeCount} 条`);
    } catch (edgeError) {
      logger.error(edgeError instanceof Error ? edgeError : new Error("图边构建失败"), {
        operation: "build_knowledge_graph",
      });
    }

    // 7. 自动关联到默认知识库（不阻塞主流程）
    try {
      await autoAssignToDefaultBrain(supabase, userId, docId);
    } catch (assignError) {
      logger.error(assignError instanceof Error ? assignError : new Error("默认知识库关联失败"), {
        operation: "assign_default_brain",
      });
    }

    return docId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    logger.error(err instanceof Error ? err : new Error("文档处理失败"), {
      operation: "process_knowledge_document",
    });
    await updateDocumentStatus(supabase, docId, "failed", {
      errorMessage: message,
    });
    throw err;
  }
}

/** 直接通过纯文本创建知识库文档（用于粘贴等方式） */
export async function createFromText(
  supabase: UserSupabaseClient,
  userId: string,
  input: {
    title: string;
    content: string;
    source?: string;
  },
): Promise<string> {
  return processDocumentUpload(supabase, userId, {
    title: input.title,
    content: input.content,
    fileType: "txt",
    fileHash: simpleHash(input.content),
  });
}

/** 获取用户的文档列表 */
export async function getDocumentList(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<KnowledgeDocument[]> {
  return listDocuments(supabase, userId);
}

/** 删除文档 */
export async function removeDocument(supabase: UserSupabaseClient, docId: string): Promise<void> {
  return deleteDocument(supabase, docId);
}

/** 简单哈希（用于去重） */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}
