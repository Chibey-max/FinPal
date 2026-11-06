import {
  isCommittedSend,
  type SendDraftRepository,
  type StoredSendDraft,
} from "./send-draft-repository";

/**
 * In-memory sends for tests and mock mode. Mock mode passes its shared
 * store, so every route and page sees the same sends.
 */
export function createMemorySendDraftRepository(
  storage: () => Map<string, StoredSendDraft> = singleMap(),
): SendDraftRepository {
  return {
    async save(draft) {
      storage().set(draft.id, { ...draft });
    },
    async get(userId, draftId) {
      const found = storage().get(draftId);
      return found?.userId === userId ? { ...found } : null;
    },
    async getByIdempotencyKey(userId, idempotencyKey) {
      for (const draft of storage().values()) {
        if (
          draft.userId === userId &&
          draft.idempotencyKey === idempotencyKey
        ) {
          return { ...draft };
        }
      }
      return null;
    },
    async list(userId, limit) {
      return [...storage().values()]
        .filter((draft) => draft.userId === userId)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, limit)
        .map((draft) => ({ ...draft }));
    },
    async updateIfStatus(userId, draftId, expected, patch) {
      // Check and write with no await in between, so this is atomic in JS.
      const found = storage().get(draftId);
      if (!found || found.userId !== userId || found.status !== expected) {
        return false;
      }
      storage().set(draftId, { ...found, ...patch });
      return true;
    },
    async sumCommitted(userId, currency, from, to) {
      let cents = 0;
      for (const draft of storage().values()) {
        if (userId !== null && draft.userId !== userId) continue;
        if (draft.currency !== currency || !draft.sentAt) continue;
        if (!isCommittedSend(draft)) continue;
        const at = new Date(draft.sentAt).getTime();
        if (at >= from.getTime() && at < to.getTime()) {
          cents += Math.round(draft.amount * 100);
        }
      }
      return cents / 100;
    },
  };
}

function singleMap() {
  const map = new Map<string, StoredSendDraft>();
  return () => map;
}
