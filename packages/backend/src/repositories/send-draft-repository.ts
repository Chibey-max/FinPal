import type { SendDraft } from "@finpal/contracts";

export interface StoredSendDraft extends SendDraft {
  userId: string;
  idempotencyKey: string | null;
  /** When the send was approved; it counts against limits from then on. */
  sentAt: string | null;
}

export type SendDraftPatch = Partial<
  Pick<
    StoredSendDraft,
    | "status"
    | "ruleOutcome"
    | "ruleReason"
    | "balanceAfterSend"
    | "idempotencyKey"
    | "sentAt"
    | "updatedAt"
  >
>;

export interface SendDraftRepository {
  save(draft: StoredSendDraft): Promise<void>;
  get(userId: string, draftId: string): Promise<StoredSendDraft | null>;
  getByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<StoredSendDraft | null>;
  list(userId: string, limit: number): Promise<StoredSendDraft[]>;
  /**
   * Applies the patch only while the draft still has `expected` status, in
   * one step. False when another request changed it first.
   */
  updateIfStatus(
    userId: string,
    draftId: string,
    expected: SendDraft["status"],
    patch: SendDraftPatch,
  ): Promise<boolean>;
  /**
   * Money sent or being sent in [from, to) by sent time: PAYING or SENT, and
   * not FAILED or RETURNED at PayPal. A null userId sums every user.
   */
  sumCommitted(
    userId: string | null,
    currency: string,
    from: Date,
    to: Date,
  ): Promise<number>;
}

/** Statuses whose money has left, or is leaving, the wallet. */
export function isCommittedSend(draft: StoredSendDraft) {
  return (
    (draft.status === "PAYING" || draft.status === "SENT") &&
    draft.payoutStatus !== "FAILED" &&
    draft.payoutStatus !== "RETURNED"
  );
}
