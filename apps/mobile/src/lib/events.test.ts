import type { AuditEvent } from "@finpal/contracts";
import { auditEventTypeSchema } from "@finpal/contracts";
import { describe, expect, it } from "vitest";

import { entityShort, eventTone, summarizeEvent } from "./events";

function event(
  type: AuditEvent["type"],
  payload: Record<string, unknown> = {},
): AuditEvent {
  return {
    id: 1,
    entityType: "payment_attempt",
    entityId: "635136f8-6ce0-419f-8404-f5d21821ccca",
    type,
    payload,
    createdAt: "2026-10-18T10:00:00Z",
  };
}

describe("summarizeEvent", () => {
  it("returns a useful summary for every supported event type", () => {
    for (const type of auditEventTypeSchema.options) {
      expect(summarizeEvent(event(type))).not.toBe("");
    }
  });

  it("formats payment and decision payloads", () => {
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
        event("DECISION_RECORDED", {
          outcome: "BLOCK",
          reasonCodes: ["CONSTRAINTS_FAILED"],
        }),
      ),
    ).toBe("BLOCK · CONSTRAINTS_FAILED");
  });
});

describe("event helpers", () => {
  it("assigns semantic tones", () => {
    expect(eventTone(event("PAYMENT_CAPTURED"))).toBe("ok");
    expect(eventTone(event("PAYPAL_CALL_FAILED"))).toBe("bad");
    expect(eventTone(event("DECISION_RECORDED", { outcome: "BLOCK" }))).toBe(
      "bad",
    );
  });

  it("creates a short entity id", () => {
    expect(entityShort(event("PAYMENT_CREATED"))).toBe("pay_6351");
  });
});
