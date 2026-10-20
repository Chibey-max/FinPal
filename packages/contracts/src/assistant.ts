import { z } from "zod";

/**
 * Plain-language assistant (Groq). It only words things: the decision
 * category and every check come from the deterministic rules (PRD section 5),
 * and a drafted proposal is a prefill the user must still submit.
 */

/** "llm" when Groq wrote the text, "rules" for the built-in fallback. */
export const assistantSourceSchema = z.enum(["llm", "rules"]);

export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const decisionExplanationSchema = z.object({
  text: z.string(),
  source: assistantSourceSchema,
  /** Groq model id when source is "llm". */
  model: z.string().nullable(),
});

export type DecisionExplanation = z.infer<typeof decisionExplanationSchema>;

export const draftProposalRequestSchema = z.object({
  text: z.string().trim().min(3).max(500),
  /** Used when the text names no currency (the user's constraints currency). */
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
});

export type DraftProposalRequest = z.infer<typeof draftProposalRequestSchema>;

export const proposalDraftSchema = z.object({
  productName: z.string().trim().min(1).max(200).nullable(),
  proposedPrice: z.number().positive().max(1_000_000).nullable(),
  currency: z.string().length(3).nullable(),
  /** Local time of day, HH:MM, when the text names one. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});

export type ProposalDraftFields = z.infer<typeof proposalDraftSchema>;

export const draftProposalResultSchema = z.object({
  draft: proposalDraftSchema,
  /** Fields the user still has to fill in. */
  missing: z.array(z.enum(["productName", "proposedPrice"])),
  source: assistantSourceSchema,
  model: z.string().nullable(),
});

export type DraftProposalResult = z.infer<typeof draftProposalResultSchema>;
