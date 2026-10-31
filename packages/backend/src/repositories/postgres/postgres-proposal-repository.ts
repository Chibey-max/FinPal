import { z } from "zod";

import { proposalSourceSchema, type Proposal } from "@finpal/contracts";

import type { ProposalRepository } from "../proposal-repository";
import { queryRow, type Db } from "./db";

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

export function createPostgresProposalRepository(db: Db): ProposalRepository {
  return {
    async create(userId, input) {
      const row = await queryRow(
        db,
        `insert into public.proposals
           (user_id, product_name, proposed_price, currency, source, source_event_id, proposed_for)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning to_jsonb(proposals) as row`,
        [
          userId,
          input.productName,
          input.proposedPrice,
          input.currency,
          input.source,
          input.sourceEventId ?? null,
          input.proposedFor ?? null,
        ],
      );
      return toProposal(row);
    },

    async findById(userId, id) {
      const row = await queryRow(
        db,
        `select to_jsonb(p) as row from public.proposals p
         where user_id = $1 and id = $2`,
        [userId, id],
      );
      return row ? toProposal(row) : null;
    },
  };
}
