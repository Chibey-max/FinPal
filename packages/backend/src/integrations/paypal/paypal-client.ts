export interface PayPalClient {
  createOrder(idempotencyKey: string): Promise<{ orderId: string }>;
  authorize(orderId: string): Promise<{ authorizationId: string }>;
  capture(authorizationId: string): Promise<{ captureId: string }>;
  void(authorizationId: string): Promise<void>;
}
