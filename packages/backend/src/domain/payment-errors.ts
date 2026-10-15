import type { PaymentErrorCode } from "@finpal/contracts";

export class PaymentError extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
