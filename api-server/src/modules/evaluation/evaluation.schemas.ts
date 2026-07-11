/** 维度评分校验与钳制 */
import type { DimensionScores, DimensionSummary } from "./evaluation.types.js";

export function validateDimensionScores(
  raw: unknown,
): DimensionScores | null {
  if (!raw || typeof raw !== "object") return null;
  const validated: DimensionScores = {};
  for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length > 64) continue;
    const obj = item as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== "object") continue;
    const score = Number(obj.score);
    const comment = typeof obj.comment === "string" ? obj.comment : "";
    if (!Number.isFinite(score)) continue;
    validated[key] = {
      score: Math.max(1, Math.min(100, Math.round(score))),
      comment: comment.slice(0, 500),
    };
  }
  return Object.keys(validated).length > 0 ? validated : null;
}

export function validateDimensionSummary(
  raw: unknown,
): DimensionSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const dims = obj.dimensions as Record<string, unknown> | undefined;
  if (!dims || typeof dims !== "object") return null;

  const dimensions: DimensionSummary["dimensions"] = {};
  for (const [key, item] of Object.entries(dims)) {
    const d = item as Record<string, unknown> | undefined;
    if (!d) continue;
    dimensions[key] = {
      score: clamp(d.score, 1, 100),
      count: Math.max(1, Math.round(Number(d.count) || 0)),
      weight: Math.max(1, Math.round(Number(d.weight) || 1)),
    };
  }
  if (Object.keys(dimensions).length === 0) return null;

  return {
    dimensions,
    overallScore: clamp(obj.overallScore, 1, 100),
    strengths: toStringArray(obj.strengths),
    weaknesses: toStringArray(obj.weaknesses),
  };
}

function clamp(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, 10);
}
