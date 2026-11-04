import type { PaymentStatus } from "@finpal/contracts";

export const allowedPaymentTransitions: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = {
  CREATED: ["APPROVED"],
  // A transfer goes straight to CAPTURED: PayPal only pays someone else's
  // account through an immediate capture, so nothing is authorized first.
  APPROVED: ["AUTHORIZED", "CAPTURED"],
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
