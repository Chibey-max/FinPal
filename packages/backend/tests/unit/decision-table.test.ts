import type {
  ConstraintCheck,
  QualityScore,
  TrustSignal,
} from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import { decide } from "../../src/domain/decision-table";

const pass: ConstraintCheck = {
  constraints: "PASS",
  amount: "UNDER_CAP",
  reasons: [],
};
const outsideWindow: ConstraintCheck = {
  constraints: "FAIL",
  amount: "UNDER_CAP",
  reasons: [
    { code: "OUTSIDE_TIME_WINDOW", message: "Outside allowed spending times." },
  ],
};
const overCap: ConstraintCheck = {
  constraints: "PASS",
  amount: "OVER_CAP",
  reasons: [{ code: "OVER_PER_PURCHASE_CAP", message: "Over the $100 cap." }],
};

const quality = (score: QualityScore) => ({
  score,
  explanation: `Quality ${score}.`,
});

function outcome(
  check: ConstraintCheck | null,
  score: QualityScore,
  trust: TrustSignal = "NOT_CHECKED",
) {
  return decide({ constraintCheck: check, quality: quality(score), trust })
    .outcome;
}

describe("decision table rows (PRD section 6)", () => {
  it("auto-approves Pass + Good + trust Pass or N/A + under cap", () => {
    expect(outcome(pass, "GOOD", "PASS")).toBe("AUTO_APPROVE");
    expect(outcome(pass, "GOOD", "NOT_CHECKED")).toBe("AUTO_APPROVE");
  });

  it("sends Pass + Fair + trust Pass to manual review", () => {
    expect(outcome(pass, "FAIR", "PASS")).toBe("MANUAL_REVIEW");
  });

  it("blocks when constraints fail, whatever else", () => {
    expect(outcome(outsideWindow, "GOOD", "PASS")).toBe("BLOCK");
  });

  it("blocks Poor quality, whatever else", () => {
    expect(outcome(pass, "POOR", "PASS")).toBe("BLOCK");
  });

  it("blocks over-cap amounts, whatever else", () => {
    expect(outcome(overCap, "GOOD", "PASS")).toBe("BLOCK");
  });

  it("sends Insufficient data to manual review", () => {
    expect(outcome(pass, "INSUFFICIENT_DATA", "PASS")).toBe("MANUAL_REVIEW");
  });
});

describe("precedence", () => {
  it("lets a block beat Insufficient data", () => {
    expect(outcome(overCap, "INSUFFICIENT_DATA")).toBe("BLOCK");
    expect(outcome(outsideWindow, "INSUFFICIENT_DATA")).toBe("BLOCK");
  });

  it("reports every block reason, not just the first", () => {
    const both: ConstraintCheck = {
      constraints: "FAIL",
      amount: "OVER_CAP",
      reasons: [...outsideWindow.reasons, ...overCap.reasons],
    };
    const result = decide({
      constraintCheck: both,
      quality: quality("POOR"),
      trust: "PASS",
    });
    expect(result.reasons.map((r) => [r.code, r.source])).toEqual([
      ["CONSTRAINTS_FAILED", "constraints"],
      ["OVER_AMOUNT_CAP", "amount"],
      ["POOR_QUALITY", "quality"],
    ]);
  });
});

describe("combinations the PRD table does not list", () => {
  it("never auto-approves Good when trust failed or was unavailable", () => {
    const failed = decide({
      constraintCheck: pass,
      quality: quality("GOOD"),
      trust: "FAIL",
    });
    expect(failed.outcome).toBe("MANUAL_REVIEW");
    expect(failed.reasons.map((r) => r.code)).toEqual(["TRUST_FAILED"]);

    expect(outcome(pass, "GOOD", "UNAVAILABLE")).toBe("MANUAL_REVIEW");
  });

  it("notes that a Fair result needs trust to pass before approval", () => {
    const result = decide({
      constraintCheck: pass,
      quality: quality("FAIR"),
      trust: "NOT_CHECKED",
    });
    expect(result.outcome).toBe("MANUAL_REVIEW");
    expect(result.reasons.map((r) => r.code)).toEqual([
      "FAIR_QUALITY",
      "TRUST_REQUIRED_FOR_APPROVAL",
    ]);
  });

  it("never auto-approves a user with no spending limits", () => {
    const result = decide({
      constraintCheck: null,
      quality: quality("GOOD"),
      trust: "PASS",
    });
    expect(result.outcome).toBe("MANUAL_REVIEW");
    expect(result.reasons[0]!.code).toBe("NO_CONSTRAINTS");
  });

  it("still blocks Poor quality for a user with no spending limits", () => {
    expect(outcome(null, "POOR")).toBe("BLOCK");
  });

  it("blocks a currency mismatch, which fails both constraints and amount", () => {
    const mismatch: ConstraintCheck = {
      constraints: "FAIL",
      amount: "OVER_CAP",
      reasons: [{ code: "CURRENCY_MISMATCH", message: "EUR vs USD." }],
    };
    const result = decide({
      constraintCheck: mismatch,
      quality: quality("GOOD"),
      trust: "PASS",
    });
    expect(result.outcome).toBe("BLOCK");
    expect(result.reasons.map((r) => r.code)).toEqual([
      "CONSTRAINTS_FAILED",
      "OVER_AMOUNT_CAP",
    ]);
  });
});

describe("full matrix invariants", () => {
  const checks: (ConstraintCheck | null)[] = [
    null,
    pass,
    outsideWindow,
    overCap,
  ];
  const scores: QualityScore[] = ["GOOD", "FAIR", "POOR", "INSUFFICIENT_DATA"];
  const trusts: TrustSignal[] = ["PASS", "FAIL", "UNAVAILABLE", "NOT_CHECKED"];

  const cases = checks.flatMap((check) =>
    scores.flatMap((score) => trusts.map((trust) => ({ check, score, trust }))),
  );

  it.each(cases)("is consistent for %o", ({ check, score, trust }) => {
    const result = decide({
      constraintCheck: check,
      quality: quality(score),
      trust,
    });

    const mustBlock =
      check?.constraints === "FAIL" ||
      check?.amount === "OVER_CAP" ||
      score === "POOR";
    const canAutoApprove =
      check?.constraints === "PASS" &&
      check.amount === "UNDER_CAP" &&
      score === "GOOD" &&
      (trust === "PASS" || trust === "NOT_CHECKED");

    if (mustBlock) expect(result.outcome).toBe("BLOCK");
    else if (canAutoApprove) expect(result.outcome).toBe("AUTO_APPROVE");
    else expect(result.outcome).toBe("MANUAL_REVIEW");

    // Every decision explains itself.
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
