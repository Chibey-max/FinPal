import type { OfferCurrency } from "@finpal/contracts";

export interface Channel3SearchInput {
  query: string;
  currency: OfferCurrency;
  limit?: number;
}

/** A Channel3 offer as returned by the provider, before normalization. */
export interface Channel3Offer {
  url: string;
  domain: string;
  price: number | null;
  currency: string | null;
  availability: string | null;
  condition: string | null;
}

export interface Channel3Product {
  id: string;
  title: string;
  offers: Channel3Offer[];
}

export interface Channel3Client {
  search(input: Channel3SearchInput): Promise<Channel3Product[]>;
}

export type Channel3ErrorCode =
  | "TIMEOUT"
  | "NETWORK"
  | "UNAUTHORIZED"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export class Channel3ApiError extends Error {
  constructor(
    message: string,
    readonly code: Channel3ErrorCode,
    /** HTTP status, or 0 when Channel3 could not be reached. */
    readonly status: number,
  ) {
    super(message);
    this.name = "Channel3ApiError";
  }

  /** Worth one retry: the next attempt may succeed. */
  get retryable() {
    return (
      this.code === "TIMEOUT" ||
      this.code === "NETWORK" ||
      this.code === "PROVIDER_ERROR"
    );
  }
}
