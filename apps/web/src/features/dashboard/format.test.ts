import {
  decisionOutcomeSchema,
  paymentStatusSchema,
  qualityScoreSchema,
} from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatMoney,
  outcomeTone,
  paymentTone,
  qualityTone,
} from "./format";

describe("dashboard formatting", () => {
  it("formats money in the row's currency", () => {
    expect(formatMoney(49.5, "USD")).toBe("$49.50");
    expect(formatMoney(49.5, "GBP")).toBe("£49.50");
  });

  it("shows a dash for missing amounts such as an unknown median", () => {
    expect(formatMoney(null, "USD")).toBe("–");
  });

  it("falls back to a plain amount for an unrecognized currency code", () => {
    expect(formatMoney(10, "X")).toBe("10.00 X");
  });

  it("shows a dash for missing or invalid timestamps", () => {
    expect(formatDateTime(null)).toBe("–");
    expect(formatDateTime("not a date")).toBe("–");
    expect(formatDateTime("2026-10-23T10:00:00Z")).toMatch(/23 Oct/);
  });

  it("has a badge colour for every outcome, score and payment state", () => {
    for (const value of decisionOutcomeSchema.options) {
      expect(outcomeTone[value]).toBeDefined();
    }
    for (const value of qualityScoreSchema.options) {
      expect(qualityTone[value]).toBeDefined();
    }
    for (const value of paymentStatusSchema.options) {
      expect(paymentTone[value]).toBeDefined();
    }
  });
});
