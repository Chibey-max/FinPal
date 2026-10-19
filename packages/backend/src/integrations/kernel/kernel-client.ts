export interface MerchantTrustResult {
  signal: "PASS" | "FAIL" | "UNAVAILABLE";
  evidence?: Record<string, unknown>;
}

/** Visits a merchant URL via KERNEL and returns a pass/fail/unavailable signal. */
export interface KernelClient {
  checkMerchant(url: string): Promise<MerchantTrustResult>;
}
