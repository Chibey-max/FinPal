import type {
  ConstraintCheck,
  DecisionOutcome,
  DecisionReason,
  QualityScoreResult,
  TrustSignal,
} from "@finpal/contracts";

export interface DecisionTableInput {
  /** Null when the user has not saved any spending constraints. */
  constraintCheck: ConstraintCheck | null;
  quality: Pick<QualityScoreResult, "score" | "explanation"> &
    Partial<Pick<QualityScoreResult, "unusuallyLow">>;
  trust: TrustSignal;
}

export interface DecisionTableResult {
  outcome: DecisionOutcome;
  reasons: DecisionReason[];
  /** One-line summary for lists and audit events. */
  reason: string;
}

const capCodes = new Set([
  "OVER_PER_PURCHASE_CAP",
  "OVER_DAILY_CAP",
  "OVER_MONTHLY_CAP",
]);

function blockReasons(input: DecisionTableInput): DecisionReason[] {
  const reasons: DecisionReason[] = [];
  const check = input.constraintCheck;

  if (check) {
    for (const reason of check.reasons) {
      reasons.push(
        capCodes.has(reason.code)
          ? {
              code: "OVER_AMOUNT_CAP",
              source: "amount",
              message: reason.message,
            }
          : {
              code: "CONSTRAINTS_FAILED",
              source: "constraints",
              message: reason.message,
            },
      );
    }
    // Fail closed if a result failed without saying why.
    if (
      check.constraints === "FAIL" &&
      !reasons.some((r) => r.code === "CONSTRAINTS_FAILED")
    ) {
      reasons.push({
        code: "CONSTRAINTS_FAILED",
        source: "constraints",
        message: "Your spending rules do not allow this purchase.",
      });
    }
    if (
      check.amount === "OVER_CAP" &&
      !reasons.some((r) => r.code === "OVER_AMOUNT_CAP")
    ) {
      reasons.push({
        code: "OVER_AMOUNT_CAP",
        source: "amount",
        message: "The amount could not be confirmed to be within your caps.",
      });
    }
  }

  if (input.quality.score === "POOR") {
    reasons.push({
      code: "POOR_QUALITY",
      source: "quality",
      message: input.quality.explanation,
    });
  }
  return reasons;
}

function reviewReasons(input: DecisionTableInput): DecisionReason[] {
  const reasons: DecisionReason[] = [];
  const { quality, trust } = input;

  if (!input.constraintCheck) {
    reasons.push({
      code: "NO_CONSTRAINTS",
      source: "constraints",
      message:
        "No spending limits are set, so this cannot be approved automatically.",
    });
  }
  if (quality.score === "INSUFFICIENT_DATA") {
    reasons.push({
      code: "INSUFFICIENT_DATA",
      source: "quality",
      message: quality.explanation,
    });
  }
  if (quality.score === "FAIR") {
    reasons.push({
      code: "FAIR_QUALITY",
      source: "quality",
      message: quality.explanation,
    });
    // PRD: a Fair result needs merchant trust to pass before approval.
    if (trust !== "PASS") {
      reasons.push({
        code: "TRUST_REQUIRED_FOR_APPROVAL",
        source: "trust",
        message:
          "A Fair price can only be approved once the merchant trust check passes.",
      });
    }
    return reasons;
  }
  if (quality.score === "GOOD" && quality.unusuallyLow) {
    reasons.push({
      code: "PRICE_UNUSUALLY_LOW",
      source: "quality",
      message: quality.explanation,
    });
  }
  if (trust === "FAIL") {
    reasons.push({
      code: "TRUST_FAILED",
      source: "trust",
      message: "The merchant failed the trust check.",
    });
  }
  if (trust === "UNAVAILABLE") {
    reasons.push({
      code: "TRUST_UNAVAILABLE",
      source: "trust",
      message: "The merchant trust check could not be completed.",
    });
  }
  return reasons;
}

const outcomeLabels: Record<DecisionOutcome, string> = {
  AUTO_APPROVE: "Approved",
  MANUAL_REVIEW: "Needs review",
  BLOCK: "Blocked",
};

function summarize(outcome: DecisionOutcome, reasons: DecisionReason[]) {
  return `${outcomeLabels[outcome]}: ${reasons.map((r) => r.message).join(" ")}`;
}

/**
 * Approval decision table v1 (PRD section 6).
 *
 * | Constraints | Quality      | Trust       | Amount    | Result        |
 * | Pass        | Good         | Pass or N/A | Under cap | AUTO_APPROVE  |
 * | Pass        | Fair         | Pass        | Under cap | MANUAL_REVIEW |
 * | Fail        | any          | any         | any       | BLOCK         |
 * | any         | Poor         | any         | any       | BLOCK         |
 * | any         | any          | any         | Over cap  | BLOCK         |
 * | any         | Insufficient | any         | any       | MANUAL_REVIEW |
 * | any         | Good, < 50%  | any         | any       | MANUAL_REVIEW |
 *
 * Precedence: any block condition wins; otherwise anything short of every
 * auto-approval condition goes to manual review. Combinations the table does
 * not list (e.g. Good with trust FAIL or UNAVAILABLE) are routed to manual
 * review, never auto-approved. NOT_CHECKED trust counts as N/A. The "< 50%"
 * row goes beyond the PRD, which only limits prices that are too high: a price
 * under half the median is more likely a scam or the wrong product than a deal.
 */
export function decide(input: DecisionTableInput): DecisionTableResult {
  const blocks = blockReasons(input);
  if (blocks.length > 0) {
    return {
      outcome: "BLOCK",
      reasons: blocks,
      reason: summarize("BLOCK", blocks),
    };
  }

  const reviews = reviewReasons(input);
  if (reviews.length > 0) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: reviews,
      reason: summarize("MANUAL_REVIEW", reviews),
    };
  }

  const check = input.constraintCheck;
  const autoApprovable =
    check?.constraints === "PASS" &&
    check.amount === "UNDER_CAP" &&
    input.quality.score === "GOOD" &&
    (input.trust === "PASS" || input.trust === "NOT_CHECKED");

  if (!autoApprovable) {
    // Unreachable with today's inputs; fail safe if the inputs ever grow.
    const reasons: DecisionReason[] = [
      {
        code: "INSUFFICIENT_DATA",
        source: "decision",
        message: "Not every auto-approval condition was met.",
      },
    ];
    return {
      outcome: "MANUAL_REVIEW",
      reasons,
      reason: summarize("MANUAL_REVIEW", reasons),
    };
  }

  const reasons: DecisionReason[] = [
    {
      code: "ALL_CHECKS_PASSED",
      source: "decision",
      message: `Within your spending rules and caps. ${input.quality.explanation}`,
    },
  ];
  return {
    outcome: "AUTO_APPROVE",
    reasons,
    reason: summarize("AUTO_APPROVE", reasons),
  };
}
