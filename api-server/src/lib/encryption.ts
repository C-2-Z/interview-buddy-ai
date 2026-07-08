export {
  decrypt,
  encrypt,
  maskApiKey,
} from "../modules/settings/encryption.service.js";

export function providerFromColumn(col: string): string {
  return col.replace("_api_key", "");
}
