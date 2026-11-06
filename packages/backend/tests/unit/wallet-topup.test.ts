import { describe, expect, it } from "vitest";

import type { PayPalClient } from "../../src/integrations/paypal/paypal-client";
import { createMemoryPaypalConnectionRepository } from "../../src/repositories/memory-paypal-connection-repository";
import { createMemoryUserWalletRepository } from "../../src/repositories/memory-user-wallet-repository";
import { createPaypalConnectionService } from "../../src/use-cases/paypal-connections";
import { createWalletTopUpService } from "../../src/use-cases/wallet-topup";
import { createInMemoryAudit } from "../support/in-memory";

const USER = "00000000-0000-4000-8000-0000000000c3";

describe("wallet top-up + connect", () => {
  it("connects, tops up idempotently, and credits the ledger once", async () => {
    const connections = createMemoryPaypalConnectionRepository();
    const wallets = createMemoryUserWalletRepository();
    const audit = createInMemoryAudit();
    const connect = createPaypalConnectionService({
      connections,
      clientId: "id",
      clientSecret: "secret",
      apiBaseUrl: "https://api-m.sandbox.paypal.com",
      redirectUri: "http://localhost/callback",
    });
    await connect.connectMock(USER, {
      email: "buyer@sandbox.test",
      payerId: "PAYER1",
    });

    const topUp = createWalletTopUpService({
      paypal: {} as PayPalClient,
      connections,
      wallets,
      audit: audit.log,
      returnUrl: "http://localhost/return",
      cancelUrl: "http://localhost/cancel",
      mockCheckout: true,
    });

    const first = await topUp.start(USER, { amount: 50, currency: "USD" });
    expect(first.approveUrl).toBeNull();
    expect((await wallets.getWallet(USER))?.available).toBe(50);

    const again = await topUp.complete(USER, first.orderId);
    expect(again.credited).toBe(false);
    expect(again.available).toBe(50);
    expect(audit.types()).toContain("WALLET_TOPPED_UP");
  });

  it("refuses top-up when PayPal is not connected", async () => {
    const connections = createMemoryPaypalConnectionRepository();
    const wallets = createMemoryUserWalletRepository();
    const audit = createInMemoryAudit();
    const topUp = createWalletTopUpService({
      paypal: {} as PayPalClient,
      connections,
      wallets,
      audit: audit.log,
      returnUrl: "http://localhost/return",
      cancelUrl: "http://localhost/cancel",
      mockCheckout: true,
    });
    await expect(
      topUp.start(USER, { amount: 25, currency: "USD" }),
    ).rejects.toMatchObject({ code: "PAYPAL_NOT_CONNECTED" });
  });
});
