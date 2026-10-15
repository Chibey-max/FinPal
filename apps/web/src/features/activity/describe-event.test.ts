import type { AuditEvent } from "@finpal/contracts";
import { auditEventTypeSchema } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import { describeEvent } from "./describe-event";

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
