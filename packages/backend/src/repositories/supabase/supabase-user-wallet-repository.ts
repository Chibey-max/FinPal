import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  UserWalletRecord,
  UserWalletRepository,
  WalletLedgerEntry,
  WalletTopUpRecord,
} from "../user-wallet-repository";

function cents(value: number) {
  return Math.round(Number(value) * 100);
}

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

export function createSupabaseUserWalletRepository(
  db: SupabaseClient,
): UserWalletRepository {
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
      await this.ensureWallet(input.userId, input.currency);

      const { error: ledgerError } = await db.from("wallet_ledger_entries").insert({
        id: input.entryId,
        user_id: input.userId,
        kind: "TOP_UP",
        amount: input.amount,
        currency: input.currency,
        paypal_order_id: input.paypalOrderId,
      });
      if (ledgerError) {
        // Unique on paypal_order_id for TOP_UP → already credited.
        if (ledgerError.code === "23505") {
          const wallet = await this.ensureWallet(input.userId, input.currency);
          return { credited: false, available: wallet.available };
        }
        throw ledgerError;
      }

      const wallet = await this.ensureWallet(input.userId, input.currency);
      const available = (cents(wallet.available) + cents(input.amount)) / 100;
      const { error: updateError } = await db
        .from("user_wallets")
        .update({ available })
        .eq("user_id", input.userId);
      if (updateError) throw updateError;

      await db
        .from("wallet_top_ups")
        .update({ status: "COMPLETED", updated_at: new Date().toISOString() })
        .eq("paypal_order_id", input.paypalOrderId);

      return { credited: true, available };
    },

    async holdForSend(input) {
      const existing = await this.findHold(input.sendDraftId);
      if (existing) {
        const wallet = await this.ensureWallet(input.userId, input.currency);
        return { held: false, available: wallet.available };
      }

      const wallet = await this.ensureWallet(input.userId, input.currency);
      if (cents(wallet.available) < cents(input.amount)) {
        throw Object.assign(new Error("INSUFFICIENT_BALANCE"), {
          code: "INSUFFICIENT_BALANCE",
        });
      }

      const available = (cents(wallet.available) - cents(input.amount)) / 100;
      const { data: updated, error: updateError } = await db
        .from("user_wallets")
        .update({ available })
        .eq("user_id", input.userId)
        .gte("available", input.amount)
        .select("available")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        throw Object.assign(new Error("INSUFFICIENT_BALANCE"), {
          code: "INSUFFICIENT_BALANCE",
        });
      }

      const { error: ledgerError } = await db.from("wallet_ledger_entries").insert({
        id: input.entryId,
        user_id: input.userId,
        kind: "SEND_HOLD",
        amount: input.amount,
        currency: input.currency,
        send_draft_id: input.sendDraftId,
      });
      if (ledgerError) {
        if (ledgerError.code === "23505") {
          return { held: false, available: Number(updated.available) };
        }
        // Roll balance back best-effort.
        await db
          .from("user_wallets")
          .update({ available: wallet.available })
          .eq("user_id", input.userId);
        throw ledgerError;
      }

      return { held: true, available: Number(updated.available) };
    },

    async captureSendHold(input) {
      const { error } = await db.from("wallet_ledger_entries").insert({
        id: input.entryId,
        user_id: input.userId,
        kind: "SEND_CAPTURE",
        amount: input.amount,
        currency: input.currency,
        send_draft_id: input.sendDraftId,
      });
      if (error && error.code !== "23505") throw error;
    },

    async releaseSendHold(input) {
      const hold = await this.findHold(input.sendDraftId);
      if (!hold) {
        const wallet = await this.ensureWallet(input.userId, input.currency);
        return { released: false, available: wallet.available };
      }

      const { error: ledgerError } = await db.from("wallet_ledger_entries").insert({
        id: input.entryId,
        user_id: input.userId,
        kind: "SEND_RELEASE",
        amount: input.amount,
        currency: input.currency,
        send_draft_id: input.sendDraftId,
      });
      if (ledgerError) {
        if (ledgerError.code === "23505") {
          const wallet = await this.ensureWallet(input.userId, input.currency);
          return { released: false, available: wallet.available };
        }
        throw ledgerError;
      }

      const wallet = await this.ensureWallet(input.userId, input.currency);
      const available = (cents(wallet.available) + cents(input.amount)) / 100;
      const { error } = await db
        .from("user_wallets")
        .update({ available })
        .eq("user_id", input.userId);
      if (error) throw error;
      return { released: true, available };
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
