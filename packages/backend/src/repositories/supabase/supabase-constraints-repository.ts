import type { SupabaseClient } from "@supabase/supabase-js";

import { spendingConstraintsSchema } from "@finpal/contracts";

import type { ConstraintsRepository } from "../constraints-repository";

// Works with either a user-scoped client (RLS applies) or the service role;
// queries always filter by user id so both are safe.
export function createSupabaseConstraintsRepository(
  db: SupabaseClient,
): ConstraintsRepository {
  return {
    async get(userId) {
      const { data, error } = await db
        .from("constraints")
        .select("timezone, currency, time_windows, amount_caps")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      return spendingConstraintsSchema.parse({
        timezone: data.timezone,
        currency: data.currency,
        timeWindows: data.time_windows,
        amountCaps: data.amount_caps,
      });
    },

    async save(userId, constraints) {
      const valid = spendingConstraintsSchema.parse(constraints);
      const { error } = await db.from("constraints").upsert(
        {
          user_id: userId,
          timezone: valid.timezone,
          currency: valid.currency,
          time_windows: valid.timeWindows,
          amount_caps: valid.amountCaps,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
  };
}
