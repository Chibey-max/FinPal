import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { proposalSourceSchema, type Proposal } from "@finpal/contracts";

import type { ProposalRepository } from "../proposal-repository";

const rowSchema = z.object({
  id: z.string(),
  product_name: z.string(),
  proposed_price: z.coerce.number(),
  currency: z.string(),
  source: proposalSourceSchema,
  source_event_id: z.string().nullable(),
  proposed_for: z.string().nullable(),
  created_at: z.string(),
});

function toProposal(raw: unknown): Proposal {
  const row = rowSchema.parse(raw);
  return {
    id: row.id,
    productName: row.product_name,
    proposedPrice: row.proposed_price,
    currency: row.currency,
    source: row.source,
    sourceEventId: row.source_event_id,
    proposedFor: row.proposed_for,
    createdAt: row.created_at,
  };
}

const columns =
  "id, product_name, proposed_price, currency, source, source_event_id, proposed_for, created_at";

export function createSupabaseProposalRepository(
  db: SupabaseClient,
): ProposalRepository {
  return {
    async create(userId, input) {
      const { data, error } = await db
        .from("proposals")
        .insert({
          user_id: userId,
          product_name: input.productName,
          proposed_price: input.proposedPrice,
          currency: input.currency,
          source: input.source,
          source_event_id: input.sourceEventId ?? null,
          proposed_for: input.proposedFor ?? null,
        })
        .select(columns)
        .single();
      if (error) throw error;
      return toProposal(data);
    },

    async findById(userId, id) {
      const { data, error } = await db
        .from("proposals")
        .select(columns)
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? toProposal(data) : null;
    },
  };
}
