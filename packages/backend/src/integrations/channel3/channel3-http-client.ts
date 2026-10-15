import type { OfferCurrency } from "@finpal/contracts";
import { z } from "zod";

import {
  Channel3ApiError,
  type Channel3Client,
  type Channel3ErrorCode,
  type Channel3Product,
} from "./channel3-client";

export interface Channel3HttpClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.trychannel3.com";

// Search in the market that uses the proposal's currency.
const countryForCurrency: Record<OfferCurrency, string> = {
  USD: "US",
  CAD: "CA",
  AUD: "AU",
  GBP: "GB",
  EUR: "EU",
  SEK: "SE",
  CZK: "CZ",
  RON: "RO",
};

// The API reference documents price as {price, compare_at_price, currency};
// the guides show {amount, currency}. Accept both, and tolerate missing
// optional fields so one malformed offer cannot fail the whole search.
const priceSchema = z
  .object({
    price: z.number().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish(),
  })
  .nullish();

const offerSchema = z.object({
  url: z.string(),
  domain: z.string(),
  price: priceSchema,
  availability: z.string().nullish(),
  condition: z.string().nullish(),
});

const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  offers: z.array(z.unknown()).nullish(),
});

const searchResponseSchema = z.object({
  products: z.array(z.unknown()),
});

function errorCodeForStatus(status: number): Channel3ErrorCode {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 402) return "QUOTA_EXCEEDED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 504) return "TIMEOUT";
  if (status >= 500) return "PROVIDER_ERROR";
  return "INVALID_REQUEST";
}

function toProduct(raw: unknown): Channel3Product | null {
  const product = productSchema.safeParse(raw);
  if (!product.success) return null;

  const offers = (product.data.offers ?? []).flatMap((rawOffer) => {
    const offer = offerSchema.safeParse(rawOffer);
    if (!offer.success) return [];
    const price = offer.data.price;
    return [
      {
        url: offer.data.url,
        domain: offer.data.domain,
        price: price?.price ?? price?.amount ?? null,
        currency: price?.currency ?? null,
        availability: offer.data.availability ?? null,
        condition: offer.data.condition ?? null,
      },
    ];
  });
  return { id: product.data.id, title: product.data.title, offers };
}

export function createChannel3HttpClient(
  options: Channel3HttpClientOptions,
): Channel3Client {
  const baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL).origin;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  async function send(body: unknown): Promise<Response> {
    try {
      return await doFetch(`${baseUrl}/v1/search`, {
        method: "POST",
        headers: {
          "x-api-key": options.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new Channel3ApiError(
        timedOut ? "Channel3 search timed out." : "Channel3 is unreachable.",
        timedOut ? "TIMEOUT" : "NETWORK",
        0,
      );
    }
  }

  async function searchOnce(body: unknown): Promise<Channel3Product[]> {
    const response = await send(body);
    if (!response.ok) {
      throw new Channel3ApiError(
        `Channel3 search failed with ${response.status}.`,
        errorCodeForStatus(response.status),
        response.status,
      );
    }
    const parsed = searchResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) {
      throw new Channel3ApiError(
        "Channel3 returned an unexpected response.",
        "INVALID_RESPONSE",
        response.status,
      );
    }
    return parsed.data.products.flatMap((raw) => toProduct(raw) ?? []);
  }

  return {
    async search(input) {
      const body = {
        query: input.query,
        limit: Math.min(input.limit ?? 30, 30),
        filters: { availability: ["InStock"], conditions: ["new"] },
        config: {
          currency: input.currency,
          country: countryForCurrency[input.currency],
        },
      };
      try {
        return await searchOnce(body);
      } catch (error) {
        // One retry for transient failures; never for auth, quota or bad input.
        if (error instanceof Channel3ApiError && error.retryable) {
          return searchOnce(body);
        }
        throw error;
      }
    },
  };
}
