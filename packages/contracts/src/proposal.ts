import { z } from "zod";

export const createProposalSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  proposedPrice: z.number().positive(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
  source: z.enum(["MANUAL", "CALENDAR"]),
  sourceEventId: z.string().optional(),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;
