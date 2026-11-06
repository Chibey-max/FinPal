export interface PaypalConnectionRecord {
  userId: string;
  refreshTokenEncrypted: string;
  payerId: string;
  email: string;
  needsReconnect: boolean;
}

/** Service role only: holds each user's encrypted PayPal refresh token. */
export interface PaypalConnectionRepository {
  get(userId: string): Promise<PaypalConnectionRecord | null>;
  save(
    userId: string,
    input: {
      refreshTokenEncrypted: string;
      payerId: string;
      email: string;
    },
  ): Promise<void>;
  markNeedsReconnect(userId: string): Promise<void>;
  remove(userId: string): Promise<void>;
}
