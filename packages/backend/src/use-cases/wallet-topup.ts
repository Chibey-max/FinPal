import { randomUUID } from "node:crypto";

import type { CreateTopUpInput, TopUpSession } from "@finpal/contracts";

import { SendError } from "../domain/send-errors";
import type { PayPalClient } from "../integrations/paypal/paypal-client";
import { PayPalApiError } from "../integrations/paypal/paypal-client";
import type { PaypalConnectionRepository } from "../repositories/paypal-connection-repository";
import type {
  UserWalletRepository,
  WalletTopUpRecord,
} from "../repositories/user-wallet-repository";
import type { AuditLog } from "../services/audit-log";

export interface WalletTopUpDeps {
  paypal: PayPalClient;
  connections: PaypalConnectionRepository;
  wallets: UserWalletRepository;
  audit: Pick<AuditLog, "record">;
  returnUrl: string;
  cancelUrl: string;
  /** When true, skip PayPal and credit immediately (mock). */
  mockCheckout?: boolean;
  now?: () => Date;
}

export type WalletTopUpService = ReturnType<typeof createWalletTopUpService>;

function cents(value: number) {
  return Math.round(value * 100);
}

export function createWalletTopUpService(deps: WalletTopUpDeps) {
  const now = () => deps.now?.() ?? new Date();

  async function requireConnected(userId: string) {
    const connection = await deps.connections.get(userId);
    if (!connection || connection.needsReconnect) {
      throw new SendError(
        "PAYPAL_NOT_CONNECTED",
        "Connect your PayPal account before topping up.",
      );
    }
    return connection;
  }

  async function start(
    userId: string,
    input: CreateTopUpInput,
  ): Promise<TopUpSession> {
    await requireConnected(userId);
    const amount = cents(input.amount) / 100;
    if (amount < 1) {
      throw new SendError("SEND_PARSE_FAILED", "Top up at least $1.00.");
    }
    const currency = (input.currency ?? "USD").toUpperCase();
    const topUpId = randomUUID();
    const stamp = now().toISOString();

    if (deps.mockCheckout) {
      const orderId = `MOCK-TOPUP-${topUpId}`;
      const row: WalletTopUpRecord = {
        id: topUpId,
        userId,
        amount,
        currency,
        paypalOrderId: orderId,
        status: "PENDING",
        createdAt: stamp,
        updatedAt: stamp,
      };
      await deps.wallets.saveTopUp(row);
      await complete(userId, orderId);
      return {
        topUpId,
        orderId,
        amount,
        currency,
        approveUrl: null,
      };
    }

    const order = await deps.paypal.createOrder({
      amount,
      currency,
      description: "FinPal wallet top-up",
      items: [{ name: "FinPal balance top-up", amount }],
      requestId: `topup-${topUpId}`,
      returnUrl: `${deps.returnUrl}?topUpId=${topUpId}`,
      cancelUrl: `${deps.cancelUrl}?topUpId=${topUpId}`,
    });

    const row: WalletTopUpRecord = {
      id: topUpId,
      userId,
      amount,
      currency,
      paypalOrderId: order.orderId,
      status: "PENDING",
      createdAt: stamp,
      updatedAt: stamp,
    };
    await deps.wallets.saveTopUp(row);

    return {
      topUpId,
      orderId: order.orderId,
      amount,
      currency,
      approveUrl: order.approveUrl,
    };
  }

  /**
   * After the buyer approves in PayPal: authorize + capture, then credit the
   * personal ledger once (idempotent on order id).
   */
  async function complete(
    userId: string,
    orderId: string,
  ): Promise<{ available: number; credited: boolean }> {
    const topUp = await deps.wallets.findTopUpByOrderId(orderId);
    if (!topUp || topUp.userId !== userId) {
      throw new SendError("SEND_NOT_FOUND", "Top-up not found.");
    }
    if (topUp.status === "COMPLETED") {
      const wallet = await deps.wallets.ensureWallet(userId, topUp.currency);
      return { available: wallet.available, credited: false };
    }

    if (!deps.mockCheckout) {
      try {
        const authorization = await deps.paypal.authorizeOrder(
          orderId,
          `topup-auth-${topUp.id}`,
        );
        await deps.paypal.captureAuthorization(
          authorization.authorizationId,
          `topup-cap-${topUp.id}`,
        );
      } catch (error) {
        if (error instanceof PayPalApiError) {
          await deps.wallets.saveTopUp({
            ...topUp,
            status: "FAILED",
            updatedAt: now().toISOString(),
          });
          throw new SendError(
            "PAYPAL_DECLINED",
            "PayPal couldn't complete this top-up.",
            { issue: error.issue, debugId: error.debugId },
          );
        }
        throw error;
      }
    }

    const result = await deps.wallets.creditTopUp({
      userId,
      amount: topUp.amount,
      currency: topUp.currency,
      paypalOrderId: orderId,
      entryId: randomUUID(),
    });

    await deps.audit.record({
      userId,
      entityType: "send",
      entityId: topUp.id,
      type: "WALLET_TOPPED_UP",
      payload: {
        amount: topUp.amount,
        currency: topUp.currency,
        paypalOrderId: orderId,
        credited: result.credited,
        available: result.available,
      },
    });

    return result;
  }

  async function cancel(userId: string, topUpId: string): Promise<void> {
    const topUp = await deps.wallets.findTopUp(userId, topUpId);
    if (!topUp || topUp.status !== "PENDING") return;
    await deps.wallets.saveTopUp({
      ...topUp,
      status: "CANCELLED",
      updatedAt: now().toISOString(),
    });
  }

  return { start, complete, cancel };
}
