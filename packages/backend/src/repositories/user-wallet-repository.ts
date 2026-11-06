export type WalletLedgerKind =
  "TOP_UP" | "SEND_HOLD" | "SEND_CAPTURE" | "SEND_RELEASE" | "ADJUSTMENT";

export interface UserWalletRecord {
  userId: string;
  currency: string;
  available: number;
  updatedAt: string;
}

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  kind: WalletLedgerKind;
  amount: number;
  currency: string;
  paypalOrderId: string | null;
  sendDraftId: string | null;
  createdAt: string;
}

export interface WalletTopUpRecord {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  paypalOrderId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

/**
 * Personal FinPal ledger. Hold/capture/release must be atomic with the
 * available balance so concurrent sends cannot overdraw.
 */
export interface UserWalletRepository {
  getWallet(userId: string): Promise<UserWalletRecord | null>;
  ensureWallet(userId: string, currency?: string): Promise<UserWalletRecord>;

  findTopUpByOrderId(orderId: string): Promise<WalletTopUpRecord | null>;
  findTopUp(userId: string, topUpId: string): Promise<WalletTopUpRecord | null>;
  saveTopUp(row: WalletTopUpRecord): Promise<void>;

  /** Idempotent on paypal_order_id for TOP_UP. Returns false if already credited. */
  creditTopUp(input: {
    userId: string;
    amount: number;
    currency: string;
    paypalOrderId: string;
    entryId: string;
  }): Promise<{ credited: boolean; available: number }>;

  /** Idempotent on send_draft_id for SEND_HOLD. */
  holdForSend(input: {
    userId: string;
    amount: number;
    currency: string;
    sendDraftId: string;
    entryId: string;
  }): Promise<{ held: boolean; available: number }>;

  captureSendHold(input: {
    userId: string;
    amount: number;
    currency: string;
    sendDraftId: string;
    entryId: string;
  }): Promise<void>;

  releaseSendHold(input: {
    userId: string;
    amount: number;
    currency: string;
    sendDraftId: string;
    entryId: string;
  }): Promise<{ released: boolean; available: number }>;

  findHold(sendDraftId: string): Promise<WalletLedgerEntry | null>;
}
