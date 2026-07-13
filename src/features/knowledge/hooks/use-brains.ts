/**
 * 知识库模块：知识库（Brain）CRUD Hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listBrains, createBrain, updateBrain, deleteBrain, getDefaultBrain, getBrainDetail, addDocumentsToBrain, removeDocumentFromBrain } from "../api";
import type { CreateBrainParams, UpdateBrainParams, AddDocumentsToBrainParams } from "../types";

export const BRAINS_KEY = ["knowledge", "brains"];

/** 获取用户的所有知识库 */
export function useBrains() {
  return useQuery({
    queryKey: BRAINS_KEY,
    queryFn: () => listBrains(),
  });
}

/** 获取或创建默认知识库 */
export function useDefaultBrain() {
  return useQuery({
    queryKey: ["knowledge", "brains", "default"],
    queryFn: () => getDefaultBrain(),
    staleTime: 60_000,
  });
}

/** 获取单个知识库详情 */
export function useBrainDetail(id: string | null) {
  return useQuery({
    queryKey: ["knowledge", "brains", id],
    queryFn: () => getBrainDetail(id!),
    enabled: !!id,
  });
}

/** 创建知识库 */
export function useCreateBrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateBrainParams) => createBrain(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BRAINS_KEY });
    },
  });
}

/** 更新知识库 */
export function useUpdateBrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { id: string } & UpdateBrainParams) =>
      updateBrain(params.id, { name: params.name, description: params.description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BRAINS_KEY });
    },
  });
}

/** 删除知识库 */
export function useDeleteBrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBrain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BRAINS_KEY });
    },
  });
}

/** 关联文档到知识库 */
export function useAddDocumentsToBrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { brainId: string } & AddDocumentsToBrainParams) =>
      addDocumentsToBrain(params.brainId, { documentIds: params.documentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BRAINS_KEY });
    },
  });
}

/** 从知识库移除文档 */
export function useRemoveDocumentFromBrain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { brainId: string; documentId: string }) =>
      removeDocumentFromBrain(params.brainId, params.documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BRAINS_KEY });
    },
  });
}
