import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaypalConnectionRepository } from "../paypal-connection-repository";

export function createSupabasePaypalConnectionRepository(
  db: SupabaseClient,
): PaypalConnectionRepository {
  const table = () => db.from("paypal_connections");

  return {
    async get(userId) {
      const { data, error } = await table()
        .select(
          "user_id, refresh_token_encrypted, payer_id, email, needs_reconnect",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        userId: data.user_id as string,
        refreshTokenEncrypted: data.refresh_token_encrypted as string,
        payerId: data.payer_id as string,
        email: data.email as string,
        needsReconnect: Boolean(data.needs_reconnect),
      };
    },

    async save(userId, input) {
      const { error } = await table().upsert({
        user_id: userId,
        refresh_token_encrypted: input.refreshTokenEncrypted,
        payer_id: input.payerId,
        email: input.email,
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
