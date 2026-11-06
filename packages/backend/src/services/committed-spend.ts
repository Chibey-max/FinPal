import type { PaymentAttemptRepository } from "../repositories/payment-attempt-repository";
import type { SendDraftRepository } from "../repositories/send-draft-repository";

/** Money committed in a period, counted against the daily and monthly caps. */
export type CommittedSpend = Pick<PaymentAttemptRepository, "sumCommitted">;

/**
 * Purchases plus sends. Caps are about all money leaving, so a send counts
 * against what's left for shopping and a purchase against what's left to send.
 */
export function withSends(
  payments: CommittedSpend,
  sends: Pick<SendDraftRepository, "sumCommitted">,
): CommittedSpend {
  return {
    async sumCommitted(userId, currency, from, to) {
      const [paid, sent] = await Promise.all([
        payments.sumCommitted(userId, currency, from, to),
        sends.sumCommitted(userId, currency, from, to),
      ]);
      return (Math.round(paid * 100) + Math.round(sent * 100)) / 100;
    },
  };
}
