import { z } from "zod";

/** AGENT: created by the shopping agent, never accepted from a client. */
export const proposalSourceSchema = z.enum(["MANUAL", "CALENDAR", "AGENT"]);

export type ProposalSource = z.infer<typeof proposalSourceSchema>;

export const createProposalSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  proposedPrice: z.number().positive().max(1_000_000),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  source: proposalSourceSchema,
  sourceEventId: z.string().max(200).optional(),
  /** When the purchase is planned; time windows are checked at this time. */
  proposedFor: z.iso.datetime({ offset: true }).optional(),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;

/** What POST /api/v1/proposals accepts: only people create MANUAL or CALENDAR. */
export const createProposalRequestSchema = createProposalSchema.extend({
  source: z.enum(["MANUAL", "CALENDAR"]),
});

export const proposalSchema = z.object({
  id: z.uuid(),
  productName: z.string(),
  proposedPrice: z.number(),
  currency: z.string().length(3),
  source: proposalSourceSchema,
  sourceEventId: z.string().nullable(),
  proposedFor: z.string().nullable(),
  createdAt: z.string(),
});

export type Proposal = z.infer<typeof proposalSchema>;
