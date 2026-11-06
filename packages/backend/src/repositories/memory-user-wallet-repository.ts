import { randomUUID } from "node:crypto";

import type {
  UserWalletRecord,
  UserWalletRepository,
  WalletLedgerEntry,
  WalletTopUpRecord,
} from "./user-wallet-repository";

function cents(value: number) {
  return Math.round(value * 100);
}

export function createMemoryUserWalletRepository(): UserWalletRepository {
  const wallets = new Map<string, UserWalletRecord>();
  const ledger: WalletLedgerEntry[] = [];
  const topUps = new Map<string, WalletTopUpRecord>();
  const topUpsByOrder = new Map<string, string>();

  function walletOrThrow(userId: string): UserWalletRecord {
    const row = wallets.get(userId);
    if (!row) throw new Error(`No wallet for ${userId}`);
    return row;
  }

  return {
    async getWallet(userId) {
      return wallets.get(userId) ?? null;
    },

    async ensureWallet(userId, currency = "USD") {
      const existing = wallets.get(userId);
      if (existing) return existing;
      const row: UserWalletRecord = {
        userId,
        currency,
        available: 0,
        updatedAt: new Date().toISOString(),
      };
      wallets.set(userId, row);
      return row;
    },

    async findTopUpByOrderId(orderId) {
      const id = topUpsByOrder.get(orderId);
      return id ? (topUps.get(id) ?? null) : null;
    },

    async findTopUp(userId, topUpId) {
      const row = topUps.get(topUpId);
      return row?.userId === userId ? row : null;
    },

    async saveTopUp(row) {
      topUps.set(row.id, row);
      topUpsByOrder.set(row.paypalOrderId, row.id);
    },

    async creditTopUp(input) {
      if (
        ledger.some(
          (e) => e.kind === "TOP_UP" && e.paypalOrderId === input.paypalOrderId,
        )
      ) {
        const w = await this.ensureWallet(input.userId, input.currency);
        return { credited: false, available: w.available };
      }
      const wallet = await this.ensureWallet(input.userId, input.currency);
      const available = (cents(wallet.available) + cents(input.amount)) / 100;
      const next = {
        ...wallet,
        available,
        updatedAt: new Date().toISOString(),
      };
      wallets.set(input.userId, next);
      ledger.push({
        id: input.entryId,
        userId: input.userId,
        kind: "TOP_UP",
        amount: input.amount,
        currency: input.currency,
        paypalOrderId: input.paypalOrderId,
        sendDraftId: null,
        createdAt: new Date().toISOString(),
      });
      const topUpId = topUpsByOrder.get(input.paypalOrderId);
      if (topUpId) {
        const top = topUps.get(topUpId);
        if (top) {
          topUps.set(topUpId, {
            ...top,
            status: "COMPLETED",
            updatedAt: new Date().toISOString(),
          });
        }
      }
      return { credited: true, available };
    },

    async holdForSend(input) {
      if (
        ledger.some(
          (e) => e.kind === "SEND_HOLD" && e.sendDraftId === input.sendDraftId,
        )
      ) {
        return {
          held: false,
          available: walletOrThrow(input.userId).available,
        };
      }
      const wallet = await this.ensureWallet(input.userId, input.currency);
      if (cents(wallet.available) < cents(input.amount)) {
        throw Object.assign(new Error("INSUFFICIENT_BALANCE"), {
          code: "INSUFFICIENT_BALANCE",
        });
      }
      const available = (cents(wallet.available) - cents(input.amount)) / 100;
      wallets.set(input.userId, {
        ...wallet,
        available,
        updatedAt: new Date().toISOString(),
      });
      ledger.push({
        id: input.entryId,
        userId: input.userId,
        kind: "SEND_HOLD",
        amount: input.amount,
        currency: input.currency,
        paypalOrderId: null,
        sendDraftId: input.sendDraftId,
        createdAt: new Date().toISOString(),
      });
      return { held: true, available };
    },

    async captureSendHold(input) {
      if (
        ledger.some(
          (e) =>
            e.kind === "SEND_CAPTURE" && e.sendDraftId === input.sendDraftId,
        )
      ) {
        return;
      }
      ledger.push({
        id: input.entryId,
        userId: input.userId,
        kind: "SEND_CAPTURE",
        amount: input.amount,
        currency: input.currency,
        paypalOrderId: null,
        sendDraftId: input.sendDraftId,
        createdAt: new Date().toISOString(),
      });
    },

    async releaseSendHold(input) {
      if (
        ledger.some(
          (e) =>
            e.kind === "SEND_RELEASE" && e.sendDraftId === input.sendDraftId,
        )
      ) {
        return {
          released: false,
          available: walletOrThrow(input.userId).available,
        };
      }
      const hold = ledger.find(
        (e) => e.kind === "SEND_HOLD" && e.sendDraftId === input.sendDraftId,
      );
      if (!hold) {
        return {
          released: false,
          available: walletOrThrow(input.userId).available,
        };
      }
      const wallet = walletOrThrow(input.userId);
      const available = (cents(wallet.available) + cents(input.amount)) / 100;
      wallets.set(input.userId, {
        ...wallet,
        available,
        updatedAt: new Date().toISOString(),
      });
      ledger.push({
        id: input.entryId,
        userId: input.userId,
        kind: "SEND_RELEASE",
        amount: input.amount,
        currency: input.currency,
        paypalOrderId: null,
        sendDraftId: input.sendDraftId,
        createdAt: new Date().toISOString(),
      });
      return { released: true, available };
    },

    async findHold(sendDraftId) {
      return (
        ledger.find(
          (e) => e.kind === "SEND_HOLD" && e.sendDraftId === sendDraftId,
        ) ?? null
      );
    },
  };
}

/** Test helper: seed a connected user's ledger without going through top-up. */
export async function seedMemoryWallet(
  repo: UserWalletRepository,
  userId: string,
  available: number,
  currency = "USD",
) {
  await repo.ensureWallet(userId, currency);
  if (available <= 0) return;
  await repo.creditTopUp({
    userId,
    amount: available,
    currency,
    paypalOrderId: `seed-${userId}-${randomUUID()}`,
    entryId: randomUUID(),
  });
}
