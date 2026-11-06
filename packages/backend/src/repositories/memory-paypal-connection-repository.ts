import type {
  PaypalConnectionRecord,
  PaypalConnectionRepository,
} from "./paypal-connection-repository";

export function createMemoryPaypalConnectionRepository(): PaypalConnectionRepository {
  const byUser = new Map<string, PaypalConnectionRecord>();

  return {
    async get(userId) {
      return byUser.get(userId) ?? null;
    },
    async save(userId, input) {
      byUser.set(userId, {
        userId,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        payerId: input.payerId,
        email: input.email,
        needsReconnect: false,
      });
    },
    async markNeedsReconnect(userId) {
      const row = byUser.get(userId);
      if (row) byUser.set(userId, { ...row, needsReconnect: true });
    },
    async remove(userId) {
      byUser.delete(userId);
    },
  };
}
