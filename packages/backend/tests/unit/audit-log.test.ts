import { describe, expect, it } from "vitest";

import { REDACTED, sanitizeAuditPayload } from "../../src/domain/audit-payload";
import { createInMemoryAudit } from "../support/in-memory";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";

describe("sanitizeAuditPayload", () => {
  it("redacts secrets at any depth", () => {
    const result = sanitizeAuditPayload({
      accessToken: "abc",
      request: {
        headers: { Authorization: "Bearer abc", "X-Api-Key": "k" },
        body: { client_secret: "s", password: "p" },
      },
      cookies: [{ session_cookie: "c" }],
    });

    expect(result).toEqual({
      accessToken: REDACTED,
      request: {
        headers: { Authorization: REDACTED, "X-Api-Key": REDACTED },
        body: { client_secret: REDACTED, password: REDACTED },
      },
      cookies: [{ session_cookie: REDACTED }],
    });
  });

  it("keeps audit facts whose names merely contain a sensitive word", () => {
    const facts = {
      paypalAuthorizationId: "AUTH-1",
      paypalAuthorizationStatus: "CREATED",
      tokenCount: 3,
      debugId: "abc123",
    };
    expect(sanitizeAuditPayload(facts)).toEqual(facts);
  });

  it("makes values JSON-safe", () => {
    const result = sanitizeAuditPayload({
      when: new Date("2026-10-18T10:00:00Z"),
      missing: undefined,
      notANumber: Number.NaN,
      callback: () => "x",
      nested: [1, undefined, "two"],
    });
    expect(result).toEqual({
      when: "2026-10-18T10:00:00.000Z",
      notANumber: null,
      nested: [1, "two"],
    });
  });

  it("bounds string length and nesting depth", () => {
    const result = sanitizeAuditPayload({
      long: "x".repeat(5_000),
      deep: { a: { b: { c: { d: { e: { f: { g: "too deep" } } } } } } },
    });
    expect(String(result.long)).toHaveLength(2_000 + "…[truncated]".length);
    expect(JSON.stringify(result.deep)).toContain("[TRUNCATED]");
    expect(JSON.stringify(result.deep)).not.toContain("too deep");
  });
});

describe("audit log", () => {
  it("sanitizes payloads before storing them", async () => {
    const audit = createInMemoryAudit();
    await audit.log.record({
      userId,
      entityType: "payment_attempt",
      entityId: "p1",
      type: "PAYPAL_CALL_FAILED",
      payload: { debugId: "abc", accessToken: "secret-value" },
    });

    expect(audit.events[0]!.payload).toEqual({
      debugId: "abc",
      accessToken: REDACTED,
    });
  });

  it("pages through activity newest first", async () => {
    const audit = createInMemoryAudit();
    for (let i = 1; i <= 5; i++) {
      await audit.log.record({
        userId,
        entityType: "payment_attempt",
        entityId: `p${i}`,
        type: "PAYMENT_CREATED",
        payload: {},
      });
    }

    const first = await audit.log.listActivity(userId, { limit: 2 });
    expect(first.events.map((e) => e.entityId)).toEqual(["p5", "p4"]);
    expect(first.nextBefore).toBe(4);

    const second = await audit.log.listActivity(userId, {
      limit: 2,
      before: first.nextBefore!,
    });
    expect(second.events.map((e) => e.entityId)).toEqual(["p3", "p2"]);

    const last = await audit.log.listActivity(userId, {
      limit: 2,
      before: second.nextBefore!,
    });
    expect(last.events.map((e) => e.entityId)).toEqual(["p1"]);
    expect(last.nextBefore).toBeNull();
  });

  it("only returns the user's own events and honours filters", async () => {
    const audit = createInMemoryAudit();
    const base = { type: "PAYMENT_CREATED" as const, payload: {} };
    await audit.log.record({
      ...base,
      userId,
      entityType: "payment_attempt",
      entityId: "p1",
    });
    await audit.log.record({
      ...base,
      userId,
      entityType: "decision",
      entityId: "d1",
    });
    await audit.log.record({
      ...base,
      userId: otherUserId,
      entityType: "payment_attempt",
      entityId: "p2",
    });

    const mine = await audit.log.listActivity(userId);
    expect(mine.events.map((e) => e.entityId)).toEqual(["d1", "p1"]);

    const payments = await audit.log.listActivity(userId, {
      entityType: "payment_attempt",
    });
    expect(payments.events.map((e) => e.entityId)).toEqual(["p1"]);
  });

  it("defaults to 50 events and rejects out-of-range limits", async () => {
    const audit = createInMemoryAudit();
    await expect(
      audit.log.listActivity(userId, { limit: 0 }),
    ).rejects.toThrow();
    await expect(
      audit.log.listActivity(userId, { limit: 101 }),
    ).rejects.toThrow();
    await expect(audit.log.listActivity(userId)).resolves.toEqual({
      events: [],
      nextBefore: null,
    });
  });
});
