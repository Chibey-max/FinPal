import { spendingConstraintsSchema } from "@finpal/contracts";

import type { ConstraintsRepository } from "../constraints-repository";
import { json, type Db } from "./db";

interface ConstraintsRow {
  timezone: string;
  currency: string;
  time_windows: unknown;
  amount_caps: unknown;
}

// Every query filters by user id, so a user only ever touches their own row.
export function createPostgresConstraintsRepository(
  db: Db,
): ConstraintsRepository {
  return {
    async get(userId) {
      const { rows } = await db.query<ConstraintsRow>(
        `select timezone, currency, time_windows, amount_caps
         from public.constraints where user_id = $1`,
        [userId],
      );
      const row = rows[0];
      if (!row) return null;

      return spendingConstraintsSchema.parse({
        timezone: row.timezone,
        currency: row.currency,
        timeWindows: row.time_windows,
        amountCaps: row.amount_caps,
      });
    },

    async save(userId, constraints) {
      const valid = spendingConstraintsSchema.parse(constraints);
      await db.query(
        `insert into public.constraints (user_id, timezone, currency, time_windows, amount_caps)
         values ($1, $2, $3, $4::jsonb, $5::jsonb)
         on conflict (user_id) do update set
           timezone = excluded.timezone,
           currency = excluded.currency,
           time_windows = excluded.time_windows,
           amount_caps = excluded.amount_caps`,
        [
          userId,
          valid.timezone,
          valid.currency,
          json(valid.timeWindows),
          json(valid.amountCaps),
        ],
      );
    },

    async clear(userId) {
      await db.query("delete from public.constraints where user_id = $1", [
        userId,
      ]);
    },
  };
}
