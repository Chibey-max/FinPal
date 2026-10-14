export interface MerchantTrustResult {
  signal: "PASS" | "FAIL" | "UNAVAILABLE";
  evidence?: Record<string, unknown>;
}

export interface KernelClient {
  checkMerchant(url: string): Promise<MerchantTrustResult>;
}
