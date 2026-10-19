import {
  decisionOutcomeSchema,
  paymentStatusSchema,
  qualityScoreSchema,
  trustSignalSchema,
} from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  formatMoney,
  formatWhen,
  isOpenPayment,
  outcomeTone,
  paymentTone,
  percentOf,
  scoreTone,
  shortId,
  trustTone,
} from "./present";

describe("presentation helpers", () => {
  it("formats money in the row's currency, with a dash when missing", () => {
    expect(formatMoney(49.5, "USD")).toBe("$49.50");
    expect(formatMoney(49.5, "GBP")).toBe("£49.50");
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(10, "X")).toBe("10.00 X");
  });

  it("shows a clock for today and a date otherwise, in the given zone", () => {
    const now = new Date("2026-10-18T20:00:00Z");
    expect(formatWhen("2026-10-18T16:12:14Z", "America/Los_Angeles", now)).toBe(
      "09:12:14",
    );
    expect(formatWhen("2026-10-14T16:12:14Z", "America/Los_Angeles", now)).toBe(
      "Oct 14 · 09:12",
    );
    expect(formatWhen("nope", "UTC", now)).toBe("—");
  });

  it("derives short display ids from uuids", () => {
    expect(shortId("decision", "1a07c3e2-0000-4000-8000-000000000000")).toBe(
      "dec_1a07",
    );
    expect(shortId("payment_attempt", "ab-cd-ef")).toBe("pay_abcd");
  });

  it("has a tone for every outcome, score, payment state and trust signal", () => {
    for (const v of decisionOutcomeSchema.options)
      expect(outcomeTone[v]).toBeDefined();
    for (const v of qualityScoreSchema.options)
      expect(scoreTone[v]).toBeDefined();
    for (const v of paymentStatusSchema.options)
      expect(paymentTone[v]).toBeDefined();
    for (const v of trustSignalSchema.options)
      expect(trustTone[v]).toBeDefined();
  });

  it("treats only unfinished PayPal states as open", () => {
    expect(isOpenPayment("AUTHORIZED")).toBe(true);
    expect(isOpenPayment("CAPTURED")).toBe(false);
    expect(isOpenPayment(null)).toBe(false);
  });

  it("clamps cap percentages", () => {
    expect(percentOf(400, 800)).toBe(50);
    expect(percentOf(900, 800)).toBe(100);
    expect(percentOf(10, undefined)).toBe(0);
  });
});
