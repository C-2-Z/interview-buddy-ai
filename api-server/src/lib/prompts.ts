/** Prompt 模板兼容导出 */
export {
  buildEvaluationPrompt,
  buildInterviewerSystemPrompt,
  buildInterviewerUserPrompt,
  EVALUATION_SYSTEM_PROMPT,
  parseCompletionSignal,
} from "../modules/questions/prompt-builders.js";
export {
  buildRedirectResponse,
  formatConversation,
} from "../modules/questions/conversation.service.js";
export {
  buildGenericQuestionGenerationPrompt as buildQuestionGenerationPrompt,
  FINISH_SYSTEM_PROMPT,
  QUESTION_GEN_SYSTEM_PROMPT,
} from "../modules/sessions/question-generation.service.js";
