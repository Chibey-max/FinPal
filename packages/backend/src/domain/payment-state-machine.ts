import type { PaymentStatus } from "@finpal/contracts";

export const allowedPaymentTransitions: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = {
  CREATED: ["APPROVED"],
  APPROVED: ["AUTHORIZED"],
  AUTHORIZED: ["CAPTURED", "VOIDED"],
  CAPTURED: ["REFUNDED"],
  VOIDED: [],
  REFUNDED: [],
};

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return allowedPaymentTransitions[from].includes(to);
}
