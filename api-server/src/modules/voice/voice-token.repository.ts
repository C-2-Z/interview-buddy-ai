/** 语音连接票据的共享 Supabase 存储。 */
import { createServiceClient } from "../../shared/db/supabase.js";
import type { VoiceSocketTicketRecord, VoiceSocketTicketStore } from "./voice-token.service.js";

/** 创建 service-role 票据仓库；表无用户策略，避免票据被浏览器读取。 */
export function createVoiceSocketTicketStore(): VoiceSocketTicketStore {
  const supabase = createServiceClient();
  return {
    async issue(record) {
      // 先清理过期行，再写入两分钟票据；只 select/insert 必要的安全字段。
      await supabase
        .from("voice_socket_tickets")
        .delete()
        .lt("expires_at", new Date().toISOString());
      const { error } = await supabase.from("voice_socket_tickets").insert({
        id: record.id,
        user_id: record.userId,
        session_id: record.sessionId,
        access_token_ciphertext: record.accessTokenCiphertext,
        expires_at: new Date(record.expiresAt).toISOString(),
      });
      if (error) throw new Error("Voice socket ticket could not be issued");
    },
    async consume(id) {
      // delete returning 在单条 SQL 中完成一次性消费，并发连接最多一个获得记录。
      const { data, error } = await supabase
        .from("voice_socket_tickets")
        .delete()
        .eq("id", id)
        .select("id, user_id, session_id, access_token_ciphertext, expires_at")
        .maybeSingle();
      if (error) throw new Error("Voice socket ticket could not be consumed");
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        sessionId: data.session_id,
        accessTokenCiphertext: data.access_token_ciphertext,
        expiresAt: new Date(data.expires_at).getTime(),
      } satisfies VoiceSocketTicketRecord;
    },
  };
}
