import type { DecisionOutcome, QualityScore } from "@finpal/contracts";

export interface DecisionInput {
  constraintsPass: boolean;
  qualityScore: QualityScore;
  merchantTrust: "PASS" | "FAIL" | "UNAVAILABLE";
  underAmountCap: boolean;
}

export interface DecisionResult {
  outcome: DecisionOutcome;
  reasons: string[];
}

export interface DecisionService {
  decide(input: DecisionInput): DecisionResult;
}
