// Every mutating call takes a requestId that is sent as PayPal-Request-Id.
// PayPal replays the original response for a repeated id, so callers must
// derive it deterministically (never randomly) to make retries safe.

export interface CreatePayPalOrderInput {
  amount: number;
  currency: string;
  description: string;
  /** Line items shown at PayPal checkout; their prices must sum to `amount`. */
  items?: { name: string; amount: number }[];
  requestId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface PayPalOrder {
  orderId: string;
  status: string;
  approveUrl: string | null;
}

export interface PayPalAuthorization {
  orderStatus: string;
  authorizationId: string;
  authorizationStatus: string;
}

export interface PayPalCapture {
  captureId: string;
  captureStatus: string;
}

export interface VerifyWebhookSignatureInput {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: unknown;
}

export interface PayPalClient {
  createOrder(input: CreatePayPalOrderInput): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  authorizeOrder(
    orderId: string,
    requestId: string,
  ): Promise<PayPalAuthorization>;
  captureAuthorization(
    authorizationId: string,
    requestId: string,
  ): Promise<PayPalCapture>;
  voidAuthorization(
    authorizationId: string,
    requestId: string,
  ): Promise<{ authorizationStatus: string }>;
  /** Returns true when PayPal confirms the webhook transmission. */
  verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean>;
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when PayPal could not be reached. */
    readonly status: number,
    /** PayPal issue code, e.g. ORDER_NOT_APPROVED, or TIMEOUT/NETWORK. */
    readonly issue?: string,
    readonly debugId?: string,
  ) {
    super(message);
    this.name = "PayPalApiError";
  }
}
