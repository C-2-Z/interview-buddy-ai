/** AI 网关兼容导出：汇出 shared/ai 模块 */
export type {
  ChatMessage,
} from "../shared/ai/ai-client.js";
export {
  callAI,
  callAIWithProvider,
} from "../shared/ai/ai-client.js";
export {
  parseJsonFromAI,
} from "../shared/ai/json-parser.js";
export type {
  ModelProvider,
  ProviderName,
} from "../modules/model-providers/provider.types.js";
