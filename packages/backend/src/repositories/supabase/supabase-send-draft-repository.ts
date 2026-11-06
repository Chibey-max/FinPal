import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  payoutStatusSchema,
  sendDraftStatusSchema,
  sendRuleOutcomeSchema,
} from "@finpal/contracts";

import { SendError } from "../../domain/send-errors";
import {
  isCommittedSend,
  type SendDraftPatch,
  type SendDraftRepository,
  type StoredSendDraft,
} from "../send-draft-repository";

const UNIQUE_VIOLATION = "23505";

const rowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  amount: z.coerce.number(),
  currency: z.string(),
  recipient_email: z.string(),
  memo: z.string().nullable(),
  rule_outcome: sendRuleOutcomeSchema,
  rule_reason: z.string(),
  available_at_draft: z.coerce.number().nullable(),
  balance_after_send: z.coerce.number().nullable(),
  status: sendDraftStatusSchema,
  payout_batch_id: z.string().nullable(),
  payout_item_id: z.string().nullable(),
  payout_status: payoutStatusSchema,
  idempotency_key: z.string().nullable(),
  sent_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

function toStored(row: unknown): StoredSendDraft {
  const r = rowSchema.parse(row);
  return {
    id: r.id,
    userId: r.user_id,
    amount: r.amount,
    currency: r.currency,
    recipientEmail: r.recipient_email,
    memo: r.memo,
    ruleOutcome: r.rule_outcome,
    ruleReason: r.rule_reason,
    availableAtDraft: r.available_at_draft,
    balanceAfterSend: r.balance_after_send,
    status: r.status,
    payoutBatchId: r.payout_batch_id,
    payoutItemId: r.payout_item_id,
    payoutStatus: r.payout_status,
    idempotencyKey: r.idempotency_key,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow(draft: StoredSendDraft) {
  return {
    id: draft.id,
    user_id: draft.userId,
    amount: draft.amount,
    currency: draft.currency,
    recipient_email: draft.recipientEmail,
    memo: draft.memo,
    rule_outcome: draft.ruleOutcome,
    rule_reason: draft.ruleReason,
    available_at_draft: draft.availableAtDraft,
    balance_after_send: draft.balanceAfterSend,
    status: draft.status,
    payout_batch_id: draft.payoutBatchId,
    payout_item_id: draft.payoutItemId,
    payout_status: draft.payoutStatus,
    idempotency_key: draft.idempotencyKey,
    sent_at: draft.sentAt,
    created_at: draft.createdAt,
    updated_at: draft.updatedAt,
  };
}

function toColumns(patch: SendDraftPatch) {
  const columns: Record<string, unknown> = {};
  if (patch.status !== undefined) columns.status = patch.status;
  if (patch.ruleOutcome !== undefined) columns.rule_outcome = patch.ruleOutcome;
  if (patch.ruleReason !== undefined) columns.rule_reason = patch.ruleReason;
  if (patch.balanceAfterSend !== undefined) {
    columns.balance_after_send = patch.balanceAfterSend;
  }
  if (patch.idempotencyKey !== undefined) {
    columns.idempotency_key = patch.idempotencyKey;
  }
  if (patch.sentAt !== undefined) columns.sent_at = patch.sentAt;
  if (patch.updatedAt !== undefined) columns.updated_at = patch.updatedAt;
  return columns;
}

export function createSupabaseSendDraftRepository(
  db: SupabaseClient,
): SendDraftRepository {
  return {
    async save(draft) {
      const { error } = await db.from("send_drafts").upsert(toRow(draft), {
        onConflict: "id",
      });
      if (error) throw error;
    },

    async get(userId, draftId) {
      const { data, error } = await db
        .from("send_drafts")
        .select("*")
        .eq("user_id", userId)
        .eq("id", draftId)
        .maybeSingle();
      if (error) throw error;
      return data ? toStored(data) : null;
    },

    async getByIdempotencyKey(userId, idempotencyKey) {
      const { data, error } = await db
        .from("send_drafts")
        .select("*")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw error;
      return data ? toStored(data) : null;
    },

    async list(userId, limit) {
      const { data, error } = await db
        .from("send_drafts")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(toStored);
    },

    async updateIfStatus(userId, draftId, expected, patch) {
      // The status filter makes this a compare-and-set: of two concurrent
      // approvals, only one finds the draft still in `expected`.
      const { data, error } = await db
        .from("send_drafts")
        .update(toColumns(patch))
        .eq("user_id", userId)
        .eq("id", draftId)
        .eq("status", expected)
        .select("id");
      if (error?.code === UNIQUE_VIOLATION) {
        throw new SendError(
          "IDEMPOTENCY_KEY_REUSED",
          "That idempotency key was already used for a different send.",
        );
      }
      if (error) throw error;
      return (data ?? []).length === 1;
    },

    async sumCommitted(userId, currency, from, to) {
      let query = db
        .from("send_drafts")
        .select("*")
        .eq("currency", currency)
        .in("status", ["PAYING", "SENT"])
        .gte("sent_at", from.toISOString())
        .lt("sent_at", to.toISOString());
      if (userId !== null) query = query.eq("user_id", userId);
      const { data, error } = await query;
      if (error) throw error;
      // Sum in cents to avoid floating-point drift across many sends.
      const cents = (data ?? [])
        .map(toStored)
        .filter(isCommittedSend)
        .reduce((total, draft) => total + Math.round(draft.amount * 100), 0);
      return cents / 100;
    },
  };
}
