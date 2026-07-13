/** 模型供应商解析服务：用户自带 Key 优先，服务端默认 Key 安全兜底。 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { PROVIDER_CONFIGS } from "../../shared/ai/providers.js";
import { decrypt } from "../settings/encryption.service.js";
import { getUserSettings } from "../settings/settings.repository.js";
import type {
  ModelProvider,
  ProviderName,
} from "./provider.types.js";

export type ProviderRequest = {
  /** 请求显式选择的供应商。 */
  modelProvider?: ProviderName;
  /** 请求显式选择的模型。 */
  modelName?: string;
  /** 仅服务端内部调用可传入的临时用户 Key。 */
  userApiKey?: string;
};

export type StoredSessionProvider = {
  /** 会话冻结的供应商。 */
  model_provider: string | null;
  /** 会话冻结的模型。 */
  model_name: string | null;
  /** 历史会话可能保存的加密外部 Key。 */
  user_api_key: string | null;
};

/** 判断数据库或请求字符串是否为受支持供应商。 */
function isProviderName(value: string | null | undefined): value is ProviderName {
  return value === "deepseek" || value === "openai" || value === "anthropic";
}

/** 返回供应商配置中冻结的默认模型名。 */
function defaultModel(name: ProviderName): string {
  return PROVIDER_CONFIGS[name].defaultModel;
}

/** 将历史 DeepSeek 模型别名规范化为当前支持名称。 */
function supportedModel(name: ProviderName, model: string): string {
  if (name === "deepseek" && (model === "deepseek-chat" || model === "deepseek-reasoner")) {
    return "deepseek-v4-flash";
  }
  return model;
}

/** 返回用户设置中供应商对应的加密 Key 字段。 */
function keyColumn(name: ProviderName) {
  return `${name}_api_key` as const;
}

/**
 * 读取供应商对应的服务端默认 Key，不把值写入配置、日志或响应。
 *
 * @param name - 已校验的模型供应商。
 * @returns 非空环境 Key；未配置时为 undefined。
 */
function serverApiKey(name: ProviderName): string | undefined {
  const value = process.env[`${name.toUpperCase()}_API_KEY`]?.trim();
  return value || undefined;
}

/**
 * 为创建请求解析供应商、模型和可用 Key，优先级为请求、用户设置、服务端默认。
 *
 * @param supabase - 当前用户作用域客户端。
 * @param userId - 当前用户 UUID。
 * @param request - 创建请求中的可选模型覆盖。
 * @returns 仅留在服务端内存中的模型供应商配置。
 */
export async function resolveProviderForCreation(
  supabase: UserSupabaseClient,
  userId: string,
  request: ProviderRequest,
): Promise<ModelProvider> {
  let name = request.modelProvider;
  let model = request.modelName ?? "";
  let apiKey = request.userApiKey?.trim() || undefined;

  if (!name || !apiKey || !model) {
    const settings = await getUserSettings(supabase, userId);
    if (!name && isProviderName(settings?.model_provider)) {
      name = settings.model_provider;
    }
    if (!model && settings?.model_name) {
      model = settings.model_name;
    }
    const effectiveName = name ?? "deepseek";
    if (!apiKey && settings?.[keyColumn(effectiveName)]) {
      try {
        apiKey = decrypt(settings[keyColumn(effectiveName)] ?? "");
      } catch {
        apiKey = undefined;
      }
    }
  }

  const providerName = name ?? "deepseek";
  return {
    name: providerName,
    model: supportedModel(providerName, model || defaultModel(providerName)),
    // BYOK 优先；未配置用户 Key 时使用服务端能力，让普通用户无需理解供应商设置。
    apiKey: apiKey ?? serverApiKey(providerName),
  };
}

/**
 * 为已有会话恢复冻结供应商，并从历史会话、用户设置或服务端默认解析 Key。
 *
 * @param supabase - 当前用户作用域客户端。
 * @param userId - 当前用户 UUID。
 * @param session - 会话冻结的模型字段。
 * @returns 可恢复模型调用且不写回 Key 的供应商配置。
 */
export async function resolveProviderForSession(
  supabase: UserSupabaseClient,
  userId: string,
  session: StoredSessionProvider,
): Promise<ModelProvider> {
  const name = isProviderName(session.model_provider)
    ? session.model_provider
    : "deepseek";
  let apiKey = session.user_api_key?.trim() || undefined;
  if (!apiKey) {
    const settings = await getUserSettings(supabase, userId);
    const encrypted = settings?.[keyColumn(name)];
    if (encrypted) {
      try {
        apiKey = decrypt(encrypted);
      } catch {
        apiKey = undefined;
      }
    }
  }
  return {
    name,
    model: supportedModel(name, session.model_name || defaultModel(name)),
    apiKey: apiKey ?? serverApiKey(name),
  };
}

