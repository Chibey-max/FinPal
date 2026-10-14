import { z } from "zod";

export const decisionOutcomeSchema = z.enum([
  "AUTO_APPROVE",
  "MANUAL_REVIEW",
  "BLOCK",
]);

export type DecisionOutcome = z.infer<typeof decisionOutcomeSchema>;
