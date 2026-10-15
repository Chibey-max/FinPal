import { z } from "zod";

import { constraintCheckSchema } from "./constraints";
import { proposalSchema } from "./proposal";
import { qualityScoreResultSchema } from "./quality-score";

export const decisionOutcomeSchema = z.enum([
  "AUTO_APPROVE",
  "MANUAL_REVIEW",
  "BLOCK",
]);

export type DecisionOutcome = z.infer<typeof decisionOutcomeSchema>;

/**
 * Merchant trust (KERNEL). NOT_CHECKED means no trust check is configured,
 * which the decision table treats as "N/A". UNAVAILABLE means a check was
 * attempted and failed (e.g. timeout).
 */
export const trustSignalSchema = z.enum([
  "PASS",
  "FAIL",
  "UNAVAILABLE",
  "NOT_CHECKED",
]);

export type TrustSignal = z.infer<typeof trustSignalSchema>;

export const decisionReasonCodeSchema = z.enum([
  // Block reasons
  "CONSTRAINTS_FAILED",
  "OVER_AMOUNT_CAP",
  "POOR_QUALITY",
  // Manual review reasons
  "NO_CONSTRAINTS",
  "INSUFFICIENT_DATA",
  "FAIR_QUALITY",
  "TRUST_FAILED",
  "TRUST_UNAVAILABLE",
  "TRUST_REQUIRED_FOR_APPROVAL",
  // Auto-approve
  "ALL_CHECKS_PASSED",
]);

export type DecisionReasonCode = z.infer<typeof decisionReasonCodeSchema>;

export const decisionReasonSchema = z.object({
  code: decisionReasonCodeSchema,
  /** Which decision-table input produced the reason. */
  source: z.enum(["constraints", "amount", "quality", "trust", "decision"]),
  message: z.string(),
});

export type DecisionReason = z.infer<typeof decisionReasonSchema>;

export const decisionSchema = z.object({
  id: z.uuid(),
  evaluationId: z.uuid(),
  outcome: decisionOutcomeSchema,
  /** One-line human summary of `reasons`. */
  reason: z.string(),
  reasons: z.array(decisionReasonSchema),
  decidedAt: z.string(),
});

export type Decision = z.infer<typeof decisionSchema>;

export const evaluationSchema = z.object({
  id: z.uuid(),
  proposalId: z.uuid(),
  quality: qualityScoreResultSchema,
  constraintCheck: constraintCheckSchema.nullable(),
  trustSignal: trustSignalSchema,
  createdAt: z.string(),
});

export type Evaluation = z.infer<typeof evaluationSchema>;

export const evaluateProposalSchema = z.object({
  proposalId: z.uuid(),
});

export const proposalEvaluationSchema = z.object({
  proposal: proposalSchema,
  evaluation: evaluationSchema,
  decision: decisionSchema,
});

export type ProposalEvaluation = z.infer<typeof proposalEvaluationSchema>;
