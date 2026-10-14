import { paymentStatusSchema } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import {
  allowedPaymentTransitions,
  canTransitionPayment,
} from "../../src/domain/payment-state-machine";

describe("payment state machine", () => {
  it("follows the happy path CREATED -> APPROVED -> AUTHORIZED -> CAPTURED", () => {
    expect(canTransitionPayment("CREATED", "APPROVED")).toBe(true);
    expect(canTransitionPayment("APPROVED", "AUTHORIZED")).toBe(true);
    expect(canTransitionPayment("AUTHORIZED", "CAPTURED")).toBe(true);
  });

  it("allows void only from AUTHORIZED", () => {
    for (const status of paymentStatusSchema.options) {
      expect(canTransitionPayment(status, "VOIDED")).toBe(
        status === "AUTHORIZED",
      );
    }
  });

  it("never voids after capture", () => {
    expect(canTransitionPayment("CAPTURED", "VOIDED")).toBe(false);
  });

  it("rejects skipping states", () => {
    expect(canTransitionPayment("CREATED", "AUTHORIZED")).toBe(false);
    expect(canTransitionPayment("APPROVED", "CAPTURED")).toBe(false);
  });

  it("treats VOIDED and REFUNDED as terminal", () => {
    expect(allowedPaymentTransitions.VOIDED).toEqual([]);
    expect(allowedPaymentTransitions.REFUNDED).toEqual([]);
  });

  it("defines transitions for every payment status", () => {
    expect(Object.keys(allowedPaymentTransitions).sort()).toEqual(
      [...paymentStatusSchema.options].sort(),
    );
  });
});
