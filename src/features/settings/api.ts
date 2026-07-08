import { apiRequest } from "@/shared/api/http-client";

export type SettingsResponse = {
  model_provider: string;
  model_name: string | null;
  keys: Record<string, { set: boolean; masked: string | null }>;
};

export type UpdateSettingsBody = {
  model_provider?: string;
  model_name?: string | null;
  keys?: Record<string, string>;
};

export function getSettings(): Promise<SettingsResponse> {
  return apiRequest("GET", "/api/settings");
}

export function updateSettings(
  body: UpdateSettingsBody,
): Promise<{ message: string }> {
  return apiRequest("PUT", "/api/settings", body);
}

