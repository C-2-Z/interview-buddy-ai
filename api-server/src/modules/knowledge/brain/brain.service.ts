/**
 * 知识库 Brain 模块：业务流程编排
 */

import type { UserSupabaseClient } from "../../../shared/db/supabase.js";
import { createModuleLogger } from "../../../shared/logger/voice-logger.js";
import {
  createBrain as repoCreateBrain,
  listBrains as repoListBrains,
  getBrain as repoGetBrain,
  updateBrain as repoUpdateBrain,
  deleteBrain as repoDeleteBrain,
  ensureDefaultBrain,
  addDocumentsToBrain,
  removeDocumentFromBrain,
  getBrainDocumentIds,
} from "./brain.repository.js";
import type { Brain, BrainCreateInput, BrainUpdateInput } from "./brain.types.js";

const logger = createModuleLogger("brain-service");

/** 获取用户的所有知识库 */
export async function getBrains(supabase: UserSupabaseClient, userId: string): Promise<Brain[]> {
  return repoListBrains(supabase, userId);
}

/** 创建知识库 */
export async function createBrain(
  supabase: UserSupabaseClient,
  userId: string,
  input: BrainCreateInput,
): Promise<Brain> {
  const brain = await repoCreateBrain(supabase, userId, input);
  logger.info("知识库已创建", { brainId: brain.id });
  return brain;
}

/** 获取知识库详情（含关联文档 ID）*/
export async function getBrainDetail(
  supabase: UserSupabaseClient,
  brainId: string,
): Promise<{ brain: Brain; documentIds: string[] } | null> {
  const brain = await repoGetBrain(supabase, brainId);
  if (!brain) return null;
  const documentIds = await getBrainDocumentIds(supabase, brainId);
  return { brain, documentIds };
}

/** 更新知识库 */
export async function updateBrain(
  supabase: UserSupabaseClient,
  brainId: string,
  input: BrainUpdateInput,
): Promise<void> {
  await repoUpdateBrain(supabase, brainId, input);
  logger.info(`知识库已更新: id=${brainId}`);
}

/** 删除知识库 */
export async function deleteBrain(supabase: UserSupabaseClient, brainId: string): Promise<void> {
  await repoDeleteBrain(supabase, brainId);
  logger.info(`知识库已删除: id=${brainId}`);
}

/** 获取或创建默认知识库 */
export async function getOrCreateDefaultBrain(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<Brain> {
  return ensureDefaultBrain(supabase, userId);
}

/** 关联文档到知识库 */
export async function addDocuments(
  supabase: UserSupabaseClient,
  brainId: string,
  documentIds: string[],
): Promise<void> {
  await addDocumentsToBrain(supabase, brainId, documentIds);
  logger.info(`文档已关联到知识库: brainId=${brainId}, count=${documentIds.length}`);
}

/** 从知识库移除文档 */
export async function removeDocument(
  supabase: UserSupabaseClient,
  brainId: string,
  documentId: string,
): Promise<void> {
  await removeDocumentFromBrain(supabase, brainId, documentId);
  logger.info(`文档已从知识库移除: brainId=${brainId}, documentId=${documentId}`);
}

/** 上传文档后自动关联到默认知识库 */
export async function autoAssignToDefaultBrain(
  supabase: UserSupabaseClient,
  userId: string,
  documentId: string,
): Promise<void> {
  const brain = await ensureDefaultBrain(supabase, userId);
  await addDocumentsToBrain(supabase, brain.id, [documentId]);
  logger.info(`文档已自动关联到默认知识库: docId=${documentId}, brainId=${brain.id}`);
}
