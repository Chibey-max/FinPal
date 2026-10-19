import type { AuditEvent } from "@finpal/contracts";
import { auditEventTypeSchema } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import { describeEvent, eventTypeTone, summarizeEvent } from "./describe-event";

function event(
  type: AuditEvent["type"],
  payload: Record<string, unknown> = {},
): AuditEvent {
  return {
    id: 1,
    entityType: "payment_attempt",
    entityId: "p1",
    type,
    payload,
    createdAt: "2026-10-18T10:00:00Z",
  };
}

describe("describeEvent", () => {
  it("has a title for every event type", () => {
    for (const type of auditEventTypeSchema.options) {
      expect(describeEvent(event(type)).title).not.toBe("");
    }
  });

  it("formats payment amounts and shows the PayPal id", () => {
    expect(
      describeEvent(
        event("PAYMENT_AUTHORIZED", {
          amount: 49.5,
          currency: "USD",
          paypalAuthorizationId: "AUTH-1",
        }),
      ),
    ).toEqual({
      title: "Payment authorized",
      tone: "success",
      detail: "$49.50 · AUTH-1",
    });
  });

  it("colours decisions by outcome", () => {
    expect(
      describeEvent(
        event("DECISION_RECORDED", { outcome: "BLOCK", reason: "Over cap" }),
      ),
    ).toEqual({ title: "Decision: BLOCK", tone: "danger", detail: "Over cap" });
  });

  it("shows PayPal failure details including the debug id", () => {
    expect(
      describeEvent(
        event("PAYPAL_CALL_FAILED", {
          operation: "captureAuthorization",
          issue: "AUTHORIZATION_EXPIRED",
          debugId: "abc123",
        }),
      ),
    ).toEqual({
      title: "PayPal captureAuthorization failed",
      tone: "danger",
      detail: "AUTHORIZATION_EXPIRED · debug id abc123",
    });
  });

  it("tolerates missing or malformed payload fields", () => {
    expect(
      describeEvent(event("PAYMENT_CAPTURED", { amount: "lots", currency: 5 })),
    ).toEqual({
      title: "Payment captured",
      tone: "success",
      detail: undefined,
    });
  });
});

describe("summarizeEvent", () => {
  const event = (
    type: AuditEvent["type"],
    payload: Record<string, unknown>,
  ): AuditEvent => ({
    id: 1,
    entityType: "payment_attempt",
    entityId: "x",
    type,
    payload,
    createdAt: "2026-10-18T10:00:00Z",
  });

  it("writes short, payload-based details", () => {
    expect(
      summarizeEvent(
        event("PAYMENT_CREATED", {
          paypalOrderId: "5O19",
          amount: 119.99,
          currency: "USD",
        }),
      ),
    ).toBe("Order 5O19 · $119.99");
    expect(
      summarizeEvent(
        event("EVALUATION_COMPLETED", {
          qualityScore: "GOOD",
          medianPrice: 339.99,
        }),
      ),
    ).toBe("GOOD · median 339.99");
    expect(
      summarizeEvent(
        event("DECISION_RECORDED", {
          outcome: "BLOCK",
          reasonCodes: ["CONSTRAINTS_FAILED"],
        }),
      ),
    ).toBe("BLOCK · CONSTRAINTS_FAILED");
    expect(
      summarizeEvent(event("CONSTRAINTS_UPDATED", { cleared: true })),
    ).toBe("Constraints cleared");
  });

  it("colours failures and blocks as bad, payments as info", () => {
    expect(eventTypeTone(event("PAYMENT_VOIDED", {}))).toBe("bad");
    expect(
      eventTypeTone(event("DECISION_RECORDED", { outcome: "BLOCK" })),
    ).toBe("bad");
    expect(eventTypeTone(event("PAYMENT_CAPTURED", {}))).toBe("ok");
    expect(eventTypeTone(event("PAYMENT_AUTHORIZED", {}))).toBe("info");
  });
});
