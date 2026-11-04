import type { SupabaseClient } from "@supabase/supabase-js";

import type { CalendarConnectionRepository } from "../calendar-connection-repository";

export function createSupabaseCalendarConnectionRepository(
  db: SupabaseClient,
): CalendarConnectionRepository {
  const table = () => db.from("calendar_connections");

  return {
    async get(userId) {
      const { data, error } = await table()
        .select("user_id, refresh_token_encrypted, needs_reconnect")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            userId: data.user_id as string,
            refreshTokenEncrypted: data.refresh_token_encrypted as string,
            needsReconnect: data.needs_reconnect as boolean,
          }
        : null;
    },
    async save(userId, refreshTokenEncrypted) {
      const { error } = await table().upsert({
        user_id: userId,
        refresh_token_encrypted: refreshTokenEncrypted,
        needs_reconnect: false,
      });
      if (error) throw error;
    },
    async markNeedsReconnect(userId) {
      const { error } = await table()
        .update({ needs_reconnect: true })
        .eq("user_id", userId);
      if (error) throw error;
    },
    async remove(userId) {
      const { error } = await table().delete().eq("user_id", userId);
      if (error) throw error;
    },
  };
}
