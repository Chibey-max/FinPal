import "server-only";

import type {
  AuditEntityType,
  AuditEventType,
  Decision,
  Evaluation,
  Proposal,
  SpendingConstraints,
  TrustSignal,
} from "@finpal/contracts";
import type { PaymentAttemptRecord, StoredSendDraft } from "@finpal/backend";

export type Owned<T> = T & { userId: string };

export interface StoredAuditEvent {
  id: number;
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  type: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SimulatedOrder {
  status: string;
  authorizationId?: string;
  authorizationStatus?: string;
}

export interface SimulatedPayout {
  batchId: string;
  transactionStatus: string;
}

/** Everything mock mode persists, standing in for the Supabase tables. */
export interface MockStore {
  proposals: Owned<Proposal>[];
  evaluations: Owned<Evaluation>[];
  decisions: Owned<Decision>[];
  constraints: Map<string, SpendingConstraints>;
  payments: PaymentAttemptRecord[];
  audit: StoredAuditEvent[];
  /** Simulated PayPal Sandbox state, keyed by order id. */
  orders: Map<string, SimulatedOrder>;
  /** Simulated Payouts items, keyed by payout item id. */
  payouts: Map<string, SimulatedPayout>;
  /** Send drafts, shared by every route and page (see mock/index.ts). */
  sendDrafts: Map<string, StoredSendDraft>;
  /** Mock Sandbox merchant available balance (USD). */
  walletAvailable: number;
  /** PayPal-Request-Id replays, so retried calls return the first result. */
  replays: Map<string, unknown>;
  /** KERNEL (simulated): the trust result chosen per proposal. */
  trust: Map<string, TrustSignal>;
  /** Pinned clock while seeding; null means real time. */
  pinnedNow: Date | null;
}

function createStore(): MockStore {
  return {
    proposals: [],
    evaluations: [],
    decisions: [],
    constraints: new Map(),
    payments: [],
    audit: [],
    orders: new Map(),
    payouts: new Map(),
    sendDrafts: new Map(),
    walletAvailable: 1240,
    replays: new Map(),
    trust: new Map(),
    pinnedNow: null,
  };
}

// Kept on globalThis so route handlers, server components and dev hot
// reloads all share one store for the lifetime of the server process.
// The key is versioned: bump it when the stored shape changes, so a running
// dev server reseeds instead of serving rows from the old shape.
const globalStore = globalThis as typeof globalThis & {
  __finpalMockStoreV4?: MockStore;
};

export function getStore(): MockStore {
  globalStore.__finpalMockStoreV4 ??= createStore();
  return globalStore.__finpalMockStoreV4;
}

export function resetStore() {
  globalStore.__finpalMockStoreV4 = createStore();
  return globalStore.__finpalMockStoreV4;
}

export const now = () => getStore().pinnedNow ?? new Date();
