import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  UserWalletRecord,
  UserWalletRepository,
  WalletLedgerEntry,
  WalletTopUpRecord,
} from "../user-wallet-repository";

function mapWallet(row: Record<string, unknown>): UserWalletRecord {
  return {
    userId: row.user_id as string,
    currency: row.currency as string,
    available: Number(row.available),
    updatedAt: row.updated_at as string,
  };
}

function mapTopUp(row: Record<string, unknown>): WalletTopUpRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    amount: Number(row.amount),
    currency: row.currency as string,
    paypalOrderId: row.paypal_order_id as string,
    status: row.status as WalletTopUpRecord["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapLedger(row: Record<string, unknown>): WalletLedgerEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    kind: row.kind as WalletLedgerEntry["kind"],
    amount: Number(row.amount),
    currency: row.currency as string,
    paypalOrderId: (row.paypal_order_id as string | null) ?? null,
    sendDraftId: (row.send_draft_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function throwIfInsufficient(error: { message?: string; code?: string }) {
  const text = `${error.message ?? ""} ${error.code ?? ""}`;
  if (text.includes("INSUFFICIENT_BALANCE")) {
    throw Object.assign(new Error("INSUFFICIENT_BALANCE"), {
      code: "INSUFFICIENT_BALANCE",
    });
  }
}

function parseOp(data: unknown): { applied: boolean; available: number } {
  const row = data as { applied?: boolean; available?: number } | null;
  return {
    applied: Boolean(row?.applied),
    available: Number(row?.available ?? 0),
  };
}

export function createSupabaseUserWalletRepository(
  db: SupabaseClient,
): UserWalletRepository {
  async function applyOp(input: {
    op: "credit" | "hold" | "release" | "capture";
    userId: string;
    amount: number;
    currency: string;
    entryId: string;
    paypalOrderId?: string | null;
    sendDraftId?: string | null;
  }) {
    const { data, error } = await db.rpc("apply_wallet_op", {
      p_op: input.op,
      p_user_id: input.userId,
      p_amount: input.amount,
      p_currency: input.currency,
      p_entry_id: input.entryId,
      p_paypal_order_id: input.paypalOrderId ?? null,
      p_send_draft_id: input.sendDraftId ?? null,
    });
    if (error) {
      throwIfInsufficient(error);
      throw error;
    }
    return parseOp(data);
  }

  return {
    async getWallet(userId) {
      const { data, error } = await db
        .from("user_wallets")
        .select("user_id, currency, available, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapWallet(data) : null;
    },

    async ensureWallet(userId, currency = "USD") {
      const existing = await this.getWallet(userId);
      if (existing) return existing;
      const { data, error } = await db
        .from("user_wallets")
        .upsert({ user_id: userId, currency, available: 0 })
        .select("user_id, currency, available, updated_at")
        .single();
      if (error) throw error;
      return mapWallet(data);
    },

    async findTopUpByOrderId(orderId) {
      const { data, error } = await db
        .from("wallet_top_ups")
        .select("*")
        .eq("paypal_order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapTopUp(data) : null;
    },

    async findTopUp(userId, topUpId) {
      const { data, error } = await db
        .from("wallet_top_ups")
        .select("*")
        .eq("user_id", userId)
        .eq("id", topUpId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapTopUp(data) : null;
    },

    async saveTopUp(row) {
      const { error } = await db.from("wallet_top_ups").upsert({
        id: row.id,
        user_id: row.userId,
        amount: row.amount,
        currency: row.currency,
        paypal_order_id: row.paypalOrderId,
        status: row.status,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      });
      if (error) throw error;
    },

    async creditTopUp(input) {
      const result = await applyOp({
        op: "credit",
        userId: input.userId,
        amount: input.amount,
        currency: input.currency,
        entryId: input.entryId,
        paypalOrderId: input.paypalOrderId,
      });
      if (result.applied) {
        await db
          .from("wallet_top_ups")
          .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
          .eq("paypal_order_id", input.paypalOrderId);
      }
      return { credited: result.applied, available: result.available };
    },

    async holdForSend(input) {
      const result = await applyOp({
        op: "hold",
        userId: input.userId,
        amount: input.amount,
        currency: input.currency,
        entryId: input.entryId,
        sendDraftId: input.sendDraftId,
      });
      return { held: result.applied, available: result.available };
    },

    async captureSendHold(input) {
      await applyOp({
        op: "capture",
        userId: input.userId,
        amount: input.amount,
        currency: input.currency,
        entryId: input.entryId,
        sendDraftId: input.sendDraftId,
      });
    },

    async releaseSendHold(input) {
      const result = await applyOp({
        op: "release",
        userId: input.userId,
        amount: input.amount,
        currency: input.currency,
        entryId: input.entryId,
        sendDraftId: input.sendDraftId,
      });
      return { released: result.applied, available: result.available };
    },

    async findHold(sendDraftId) {
      const { data, error } = await db
        .from("wallet_ledger_entries")
        .select("*")
        .eq("kind", "SEND_HOLD")
        .eq("send_draft_id", sendDraftId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapLedger(data) : null;
    },
  };
}
