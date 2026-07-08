import { callAI } from "../../shared/ai/ai-client.js";
import { parseJsonFromAI } from "../../shared/ai/json-parser.js";
import type { ModelProvider } from "../model-providers/provider.types.js";
import {
  buildEvaluationPrompt,
  EVALUATION_SYSTEM_PROMPT,
  type InterviewContext,
} from "./prompt-builders.js";

export type EvaluationResult = {
  score: number;
  feedback: string;
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
  const result = parseJsonFromAI<EvaluationResult>(text);
  return {
    score: Math.max(1, Math.min(100, Math.round(result.score))),
    feedback: result.feedback,
  };
}

