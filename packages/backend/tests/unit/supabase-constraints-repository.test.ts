import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createSupabaseConstraintsRepository } from "../../src/repositories/supabase/supabase-constraints-repository";

describe("Supabase constraints repository", () => {
  it("clears only the user's own constraints row", async () => {
    const calls: unknown[] = [];
    const db = {
      from(table: string) {
        calls.push(["from", table]);
        return {
          delete() {
            calls.push(["delete"]);
            return {
              async eq(column: string, value: string) {
                calls.push(["eq", column, value]);
                return { error: null };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await createSupabaseConstraintsRepository(db).clear("user-1");
    expect(calls).toEqual([
      ["from", "constraints"],
      ["delete"],
      ["eq", "user_id", "user-1"],
    ]);
  });

  it("surfaces a database error when clearing fails", async () => {
    const failure = { message: "permission denied" };
    const db = {
      from: () => ({
        delete: () => ({ eq: async () => ({ error: failure }) }),
      }),
    } as unknown as SupabaseClient;
    await expect(
      createSupabaseConstraintsRepository(db).clear("user-1"),
    ).rejects.toBe(failure);
  });
});
