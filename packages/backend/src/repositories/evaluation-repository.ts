import type {
  ConstraintCheck,
  Decision,
  DecisionOutcome,
  DecisionReason,
  Evaluation,
  QualityScoreResult,
  TrustSignal,
} from "@finpal/contracts";

export interface NewEvaluation {
  userId: string;
  proposalId: string;
  quality: QualityScoreResult;
  constraintCheck: ConstraintCheck | null;
  trustSignal: TrustSignal;
  trustEvidence: Record<string, unknown>;
  decision: {
    outcome: DecisionOutcome;
    reason: string;
    reasons: DecisionReason[];
  };
}

export interface EvaluationRepository {
  /** Stores the evaluation and the decision made from it. */
  record(
    input: NewEvaluation,
  ): Promise<{ evaluation: Evaluation; decision: Decision }>;
}
