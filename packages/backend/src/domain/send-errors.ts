export type SendErrorCode =
  | "SEND_NOT_FOUND"
  | "SEND_NOT_APPROVABLE"
  | "SEND_PARSE_FAILED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INSUFFICIENT_BALANCE"
  | "PAYPAL_NOT_CONNECTED"
  | "PAYPAL_DECLINED"
  | "PAYPAL_UNAVAILABLE"
  | "PAYPAL_AUTH_FAILED";

export class SendError extends Error {
  constructor(
    readonly code: SendErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SendError";
  }
}
