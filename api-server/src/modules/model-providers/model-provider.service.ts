/** Provider 解析：按用户设置和 session 配置选择 AI 模型 */
import type { UserSupabaseClient } from "../../shared/db/supabase.js";
import { PROVIDER_CONFIGS } from "../../shared/ai/providers.js";
import { decrypt } from "../settings/encryption.service.js";
import { getUserSettings } from "../settings/settings.repository.js";
import type {
  ModelProvider,
  ProviderName,
} from "./provider.types.js";

export type ProviderRequest = {
  modelProvider?: ProviderName;
  modelName?: string;
  userApiKey?: string;
};

export type StoredSessionProvider = {
  model_provider: string | null;
  model_name: string | null;
  user_api_key: string | null;
};

/**
 * 判断 provider name
 *
 * @param value - 
 * @returns 
 */
function isProviderName(value: string | null | undefined): value is ProviderName {
  return value === "deepseek" || value === "openai" || value === "anthropic";
}

/**
 * default model
 *
 * @param name - 
 * @returns 
 */
function defaultModel(name: ProviderName): string {
  return PROVIDER_CONFIGS[name].defaultModel;
}

/**
 * key column
 *
 * @param name - 
 * @returns 
 */
function keyColumn(name: ProviderName) {
  return `${name}_api_key` as const;
}

/**
 * 解析 provider for creation
 * @returns 
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
    model: model || defaultModel(providerName),
    apiKey,
  };
}

/**
 * 解析 provider for session
 * @returns 
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
    model: session.model_name || defaultModel(name),
    apiKey,
  };
}

