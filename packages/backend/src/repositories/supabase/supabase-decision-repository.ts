import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { decisionOutcomeSchema } from "@finpal/contracts";

import type { DecisionRepository } from "../decision-repository";

const proposalSchema = z.object({
  product_name: z.string(),
  proposed_price: z.coerce.number(),
  currency: z.string(),
});

// PostgREST embeds a many-to-one relation as an object; accept arrays too.
const one = <T extends z.ZodType>(schema: T) =>
  z.union([
    schema,
    z
      .array(schema)
      .length(1)
      .transform((items) => items[0]!),
  ]);

const rowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  outcome: decisionOutcomeSchema,
  evaluations: one(z.object({ proposals: one(proposalSchema) })),
});

export function createSupabaseDecisionRepository(
  db: SupabaseClient,
): DecisionRepository {
  return {
    async findForPayment(userId, decisionId) {
      const { data, error } = await db
        .from("decisions")
        .select(
          "id, user_id, outcome, evaluations!inner(proposals!inner(product_name, proposed_price, currency))",
        )
        .eq("id", decisionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = rowSchema.parse(data);
      const proposal = row.evaluations.proposals;
      return {
        decisionId: row.id,
        userId: row.user_id,
        outcome: row.outcome,
        productName: proposal.product_name,
        amount: proposal.proposed_price,
        currency: proposal.currency,
      };
    },
  };
}
