import { callAI } from "../../shared/ai/ai-client.js";
import { parseJsonFromAI } from "../../shared/ai/json-parser.js";
import type { ModelProvider } from "../model-providers/provider.types.js";
import {
  buildEvaluationPrompt,
  EVALUATION_SYSTEM_PROMPT,
  type InterviewContext,
} from "./prompt-builders.js";

import { validateDimensionScores } from "../evaluation/evaluation.schemas.js";
import type { DimensionScores } from "../evaluation/evaluation.types.js";
import { getDimensionDefs, buildDimensionPromptSection } from "../evaluation/evaluation.service.js";
import { findSkill } from "../skills/skills.service.js";


export type EvaluationResult = {
  score: number;
  feedback: string;
  dimensions?: DimensionScores;
};

export async function evaluateConversation(params: {
  context: InterviewContext;
  conversationText: string;
  provider: ModelProvider;
}): Promise<EvaluationResult> {
  const text = await callAI(
    [
      { role: "system", content: EVALUATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildEvaluationPrompt(params.context, params.conversationText),
      },
    ],
    params.provider,
  );
  const result = parseJsonFromAI<Record<string, unknown>>(text);
  const rawDimensions = result.dimensions as Record<string, unknown> | undefined;
  return {
    score: Math.max(1, Math.min(100, Math.round(Number(result.score) || 0))),
    feedback: String(result.feedback ?? ""),
    dimensions: validateDimensionScores(rawDimensions) ?? undefined,
  };
}

