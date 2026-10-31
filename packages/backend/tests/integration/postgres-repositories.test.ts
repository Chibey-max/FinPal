import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { QualityScoreResult } from "@finpal/contracts";

import { runMigrations } from "../../src/db/migrate";
import { DuplicatePaymentAttemptError } from "../../src/repositories/payment-attempt-repository";
import { createPostgresAuditEventRepository } from "../../src/repositories/postgres/postgres-audit-event-repository";
import { createPostgresConstraintsRepository } from "../../src/repositories/postgres/postgres-constraints-repository";
import { createPostgresDashboardRepository } from "../../src/repositories/postgres/postgres-dashboard-repository";
import { createPostgresDecisionRepository } from "../../src/repositories/postgres/postgres-decision-repository";
import { createPostgresEvaluationRepository } from "../../src/repositories/postgres/postgres-evaluation-repository";
import { createPostgresPaymentAttemptRepository } from "../../src/repositories/postgres/postgres-payment-attempt-repository";
import { createPostgresPaypalWebhookEventRepository } from "../../src/repositories/postgres/postgres-paypal-webhook-event-repository";
import { createPostgresProposalRepository } from "../../src/repositories/postgres/postgres-proposal-repository";
import { createPostgresSessionRepository } from "../../src/repositories/postgres/postgres-session-repository";
import { createPostgresUserRepository } from "../../src/repositories/postgres/postgres-user-repository";
import { createAuthService } from "../../src/services/auth";

// Runs against a real, disposable Postgres, e.g.
//   docker run -d -p 127.0.0.1:55433:5432 -e POSTGRES_PASSWORD=pw postgres:17-alpine
//   TEST_DATABASE_URL=postgres://postgres:pw@127.0.0.1:55433/postgres pnpm test
// The public schema is dropped and recreated, so never point it at real data.
const url = process.env.TEST_DATABASE_URL;

const quality: QualityScoreResult = {
  score: "GOOD",
  currency: "USD",
  offerCount: 3,
  references: [],
  thresholds: { fairMaxRatio: 1.2, goodMaxRatio: 1.05 },
  explanation: "ok",
  lowestPrice: 45,
  medianPrice: 50,
  offerStatus: "OK",
  proposedPrice: 50,
  ratioToMedian: 1,
} as QualityScoreResult;

describe.skipIf(!url)("Postgres repositories", () => {
  let pool: pg.Pool;
  const auth = () =>
    createAuthService({
      users: createPostgresUserRepository(pool),
      sessions: createPostgresSessionRepository(pool),
    });

  async function newUser(email: string) {
    const result = await auth().signUp({
      email,
      password: "correct horse",
      displayName: null,
    });
    if (!result.ok) throw new Error(result.reason);
    return result.user.id;
  }

  async function newDecision(userId: string, outcome = "AUTO_APPROVE") {
    const proposal = await createPostgresProposalRepository(pool).create(
      userId,
      {
        productName: "Desk lamp",
        proposedPrice: 50,
        currency: "USD",
        source: "MANUAL",
      },
    );
    return createPostgresEvaluationRepository(pool).record({
      userId,
      proposalId: proposal.id,
      quality,
      constraintCheck: null,
      trustSignal: "PASS",
      trustEvidence: { status: 200 },
      decision: {
        outcome: outcome as "AUTO_APPROVE",
        reason: "ok",
        reasons: [
          { code: "ALL_CHECKS_PASSED", source: "decision", message: "ok" },
        ],
      },
    });
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, options: "-c TimeZone=UTC" });
    await pool.query("drop schema public cascade; create schema public;");
    await runMigrations(
      pool,
      path.resolve(__dirname, "../../../../db/migrations"),
      () => {},
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("auth", () => {
    it("signs up, signs in case-insensitively and resolves the session", async () => {
      const service = auth();
      const signUp = await service.signUp({
        email: "Ada@Example.com",
        password: "correct horse",
        displayName: "Ada",
      });
      expect(signUp.ok).toBe(true);
      if (!signUp.ok) return;
      expect(signUp.user.email).toBe("ada@example.com");
      expect(await service.getUser(signUp.token)).toMatchObject({
        email: "ada@example.com",
      });

      expect(
        await service.signIn("ADA@example.com", "wrong password"),
      ).toBeNull();
      const signedIn = await service.signIn("ADA@example.com", "correct horse");
      expect(signedIn?.user.id).toBe(signUp.user.id);

      const again = await service.signUp({
        email: "ada@EXAMPLE.com",
        password: "another one",
        displayName: null,
      });
      expect(again).toEqual({ ok: false, reason: "EMAIL_TAKEN" });

      await service.signOut(signedIn!.token);
      expect(await service.getUser(signedIn!.token)).toBeNull();
      expect(await service.getUser(signUp.token)).not.toBeNull();
    });

    it("stores only a hash of the session token", async () => {
      const result = await auth().signUp({
        email: "hash@example.com",
        password: "correct horse",
        displayName: null,
      });
      if (!result.ok) throw new Error(result.reason);
      const { rows } = await pool.query(
        "select token_hash from public.sessions",
      );
      expect(rows.map((r) => r.token_hash)).not.toContain(result.token);
    });

    it("rejects short passwords and accounts without a password", async () => {
      expect(
        await auth().signUp({
          email: "short@example.com",
          password: "1234567",
          displayName: null,
        }),
      ).toEqual({ ok: false, reason: "WEAK_PASSWORD" });

      await pool.query(
        "insert into public.users (email) values ('imported@example.com')",
      );
      expect(await auth().signIn("imported@example.com", "")).toBeNull();
      expect(
        await auth().setPassword("imported@example.com", "new password"),
      ).toBe(true);
      expect(
        await auth().signIn("imported@example.com", "new password"),
      ).not.toBeNull();
    });

    it("ends every session when the password changes", async () => {
      await newUser("reset@example.com");
      const session = await auth().signIn("reset@example.com", "correct horse");
      await auth().setPassword("reset@example.com", "a new password");
      expect(await auth().getUser(session!.token)).toBeNull();
    });

    it("ignores expired sessions", async () => {
      const past = new Date("2020-01-01T00:00:00Z");
      const expired = createAuthService({
        users: createPostgresUserRepository(pool),
        sessions: createPostgresSessionRepository(pool),
        clock: () => past,
      });
      await newUser("expired@example.com");
      const session = await expired.signIn(
        "expired@example.com",
        "correct horse",
      );
      expect(await auth().getUser(session!.token)).toBeNull();
    });
  });

  it("scopes proposals to their owner", async () => {
    const owner = await newUser("owner@example.com");
    const other = await newUser("other@example.com");
    const proposals = createPostgresProposalRepository(pool);
    const created = await proposals.create(owner, {
      productName: "Chair",
      proposedPrice: 120.5,
      currency: "USD",
      source: "CALENDAR",
      sourceEventId: "evt-1",
      proposedFor: "2026-11-02T10:00:00.000Z",
    });
    expect(created).toMatchObject({
      proposedPrice: 120.5,
      sourceEventId: "evt-1",
    });
    expect(await proposals.findById(owner, created.id)).toEqual(created);
    expect(await proposals.findById(other, created.id)).toBeNull();
  });

  it("records evaluations and reads them back on the dashboard", async () => {
    const userId = await newUser("dash@example.com");
    const { evaluation, decision } = await newDecision(userId);
    expect(evaluation.trustEvidence).toEqual({ status: 200 });
    expect(evaluation.constraintCheck).toBeNull();

    const dashboard = createPostgresDashboardRepository(pool);
    const rows = await dashboard.listDecisionRows(userId, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      decisionId: decision.id,
      productName: "Desk lamp",
      amount: 50,
      medianPrice: 50,
      reasonCodes: ["ALL_CHECKS_PASSED"],
      paymentId: null,
    });

    const record = await dashboard.getDecision(userId, decision.id);
    expect(record?.decision).toEqual(decision);
    expect(record?.evaluation.quality.score).toBe("GOOD");
    expect(record?.payment).toBeNull();

    const stranger = await newUser("stranger@example.com");
    expect(await dashboard.getDecision(stranger, decision.id)).toBeNull();
    expect(await dashboard.listDecisionRows(stranger, { limit: 10 })).toEqual(
      [],
    );
  });

  it("refuses an evaluation for someone else's proposal", async () => {
    const owner = await newUser("prop-owner@example.com");
    const thief = await newUser("prop-thief@example.com");
    const proposal = await createPostgresProposalRepository(pool).create(
      owner,
      {
        productName: "Lamp",
        proposedPrice: 10,
        currency: "USD",
        source: "MANUAL",
      },
    );
    await expect(
      createPostgresEvaluationRepository(pool).record({
        userId: thief,
        proposalId: proposal.id,
        quality,
        constraintCheck: null,
        trustSignal: "NOT_CHECKED",
        trustEvidence: {},
        decision: { outcome: "AUTO_APPROVE", reason: "x", reasons: [] },
      }),
    ).rejects.toThrow(/not found/);
  });

  it("sets a review once, only on MANUAL_REVIEW decisions", async () => {
    const userId = await newUser("review@example.com");
    const decisions = createPostgresDecisionRepository(pool);
    const patch = {
      reviewerId: userId,
      reviewStatus: "APPROVED" as const,
      reviewedAt: new Date().toISOString(),
    };

    const auto = await newDecision(userId);
    expect(
      await decisions.setReview(userId, auto.decision.id, patch),
    ).toBeNull();

    const manual = await newDecision(userId, "MANUAL_REVIEW");
    const reviewed = await decisions.setReview(
      userId,
      manual.decision.id,
      patch,
    );
    expect(reviewed).toMatchObject({
      reviewStatus: "APPROVED",
      reviewerId: userId,
    });
    expect(
      await decisions.setReview(userId, manual.decision.id, patch),
    ).toBeNull();

    expect(await decisions.findForPayment(userId, manual.decision.id)).toEqual({
      decisionId: manual.decision.id,
      userId,
      outcome: "MANUAL_REVIEW",
      reviewStatus: "APPROVED",
      productName: "Desk lamp",
      amount: 50,
      currency: "USD",
    });
    expect(await decisions.findById(userId, manual.decision.id)).toEqual(
      reviewed,
    );
  });

  it("stores payment attempts with idempotency and compare-and-set updates", async () => {
    const userId = await newUser("pay@example.com");
    const { decision } = await newDecision(userId);
    const payments = createPostgresPaymentAttemptRepository(pool);
    const attempt = {
      userId,
      decisionId: decision.id,
      status: "CREATED" as const,
      amount: 50,
      currency: "USD",
      idempotencyKey: `key-${decision.id}`,
      paypalOrderId: `ORDER-${decision.id}`,
      paypalOrderStatus: "CREATED",
      paypalAuthorizationId: null,
      paypalAuthorizationStatus: null,
      paypalCaptureId: null,
      paypalCaptureStatus: null,
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=x",
    };
    const created = await payments.insert(attempt);
    expect(created).toMatchObject({ status: "CREATED", amount: 50 });

    await expect(payments.insert(attempt)).rejects.toBeInstanceOf(
      DuplicatePaymentAttemptError,
    );
    await expect(
      payments.insert({
        ...attempt,
        idempotencyKey: "other",
        paypalOrderId: "OTHER",
      }),
    ).rejects.toBeInstanceOf(DuplicatePaymentAttemptError);

    const authorized = await payments.updateIfStatus(created.id, "CREATED", {
      status: "AUTHORIZED",
      paypalAuthorizationId: `AUTH-${decision.id}`,
      paypalAuthorizationStatus: "CREATED",
    });
    expect(authorized?.status).toBe("AUTHORIZED");
    expect(
      await payments.updateIfStatus(created.id, "CREATED", {
        status: "VOIDED",
      }),
    ).toBeNull();

    expect(
      await payments.findAnyByPayPalOrderId(attempt.paypalOrderId),
    ).toMatchObject({ id: created.id });
    expect(
      await payments.findAnyByPayPalAuthorizationId(`AUTH-${decision.id}`),
    ).toMatchObject({ id: created.id });
    expect(
      await payments.findByIdempotencyKey(userId, attempt.idempotencyKey),
    ).toMatchObject({ id: created.id });
    expect(
      await payments.findActiveByDecisionId(userId, decision.id),
    ).toMatchObject({ id: created.id });
    const other = await newUser("pay-other@example.com");
    expect(await payments.findById(other, created.id)).toBeNull();

    const day = {
      from: new Date(Date.now() - 86_400_000),
      to: new Date(Date.now() + 60_000),
    };
    expect(await payments.sumCommitted(userId, "USD", day.from, day.to)).toBe(
      50,
    );
    expect(await payments.sumCommitted(userId, "EUR", day.from, day.to)).toBe(
      0,
    );

    const record = await createPostgresDashboardRepository(pool).getDecision(
      userId,
      decision.id,
    );
    expect(record?.payment).toMatchObject({
      id: created.id,
      status: "AUTHORIZED",
    });
  });

  it("saves, replaces and clears constraints", async () => {
    const userId = await newUser("rules@example.com");
    const constraints = createPostgresConstraintsRepository(pool);
    expect(await constraints.get(userId)).toBeNull();
    const rules = {
      timezone: "Africa/Lagos",
      currency: "USD",
      timeWindows: [
        {
          days: ["MON" as const, "TUE" as const],
          start: "09:00",
          end: "17:00",
        },
      ],
      amountCaps: { perPurchase: 100, daily: 200 },
    };
    await constraints.save(userId, rules);
    expect(await constraints.get(userId)).toEqual(rules);
    await constraints.save(userId, { ...rules, timeWindows: [] });
    expect((await constraints.get(userId))?.timeWindows).toEqual([]);
    await constraints.clear(userId);
    expect(await constraints.get(userId)).toBeNull();
  });

  it("appends audit events, filters and pages them, and never edits them", async () => {
    const userId = await newUser("audit@example.com");
    const audit = createPostgresAuditEventRepository(pool);
    for (const entityId of ["a", "b", "c"]) {
      await audit.append({
        userId,
        entityType: "proposal",
        entityId,
        type: "PROPOSAL_CREATED",
        payload: { entityId, tags: ["x"] },
      });
    }
    const all = await audit.list(userId, { limit: 10 });
    expect(all.map((e) => e.entityId)).toEqual(["c", "b", "a"]);
    expect(all[0]!.payload).toEqual({ entityId: "c", tags: ["x"] });
    const page = await audit.list(userId, { limit: 10, before: all[0]!.id });
    expect(page.map((e) => e.entityId)).toEqual(["b", "a"]);
    expect(await audit.list(userId, { limit: 10, entityId: "b" })).toHaveLength(
      1,
    );

    await expect(
      pool.query("update public.audit_events set type = 'X'"),
    ).rejects.toThrow(/append-only/);
    await expect(pool.query("delete from public.audit_events")).rejects.toThrow(
      /append-only/,
    );
  });

  it("records each PayPal webhook delivery once", async () => {
    const events = createPostgresPaypalWebhookEventRepository(pool);
    const event = {
      id: "WH-1",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      resourceType: "capture",
      resourceId: "CAP-1",
      payload: { id: "WH-1" },
    };
    expect(await events.tryInsert(event)).toBe(true);
    expect(await events.tryInsert(event)).toBe(false);
  });
});
