import {
  MIN_COMPARABLE_OFFERS,
  offerCurrencySchema,
  type ComparableOffer,
  type OfferLookup,
  type OfferLookupQuery,
} from "@finpal/contracts";

import {
  Channel3ApiError,
  type Channel3Client,
  type Channel3Product,
} from "../integrations/channel3/channel3-client";

const MAX_OFFERS = 50;

export interface NormalizedOffers {
  offers: ComparableOffer[];
  excluded: OfferLookup["excluded"];
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Turns provider products into comparable offers in one currency. Offers in
 * another currency are excluded, never converted: the Quality Score must not
 * depend on an exchange rate. Missing currency counts as a mismatch.
 */
export function normalizeOffers(
  products: readonly Channel3Product[],
  currency: string,
): NormalizedOffers {
  const excluded = {
    currencyMismatch: 0,
    unavailable: 0,
    invalidPrice: 0,
    invalidUrl: 0,
    duplicate: 0,
  };
  const seen = new Set<string>();
  const offers: ComparableOffer[] = [];

  for (const product of products) {
    for (const offer of product.offers) {
      // Provider URLs are rendered as links, so only http(s) is allowed;
      // anything else (e.g. javascript:) could run script in the browser.
      const url = safeHttpUrl(offer.url);
      if (!url) {
        excluded.invalidUrl++;
        continue;
      }
      // Out of stock or used listings are not a fair price reference.
      if (
        (offer.availability !== null && offer.availability !== "InStock") ||
        (offer.condition !== null && offer.condition !== "new")
      ) {
        excluded.unavailable++;
        continue;
      }
      if (
        offer.price === null ||
        !Number.isFinite(offer.price) ||
        offer.price <= 0
      ) {
        excluded.invalidPrice++;
        continue;
      }
      if (offer.currency?.toUpperCase() !== currency) {
        excluded.currencyMismatch++;
        continue;
      }
      // One reference per merchant per product.
      const key = `${offer.domain.toLowerCase()}|${product.id}`;
      if (seen.has(key)) {
        excluded.duplicate++;
        continue;
      }
      seen.add(key);

      offers.push({
        productId: product.id,
        title: product.title,
        merchant: offer.domain.toLowerCase(),
        price: Math.round(offer.price * 100) / 100,
        currency,
        url,
      });
    }
  }

  offers.sort((a, b) => a.price - b.price);
  return { offers: offers.slice(0, MAX_OFFERS), excluded };
}

export interface ComparableOffersDeps {
  channel3: Channel3Client;
  now?: () => Date;
}

export type ComparableOffersService = ReturnType<
  typeof createComparableOffersService
>;

export function createComparableOffersService(deps: ComparableOffersDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * Never throws for provider problems: an outage or quota error yields
     * UNAVAILABLE so the purchase goes to manual review instead of failing.
     */
    async lookup(input: OfferLookupQuery): Promise<OfferLookup> {
      const currency = input.currency.toUpperCase();
      const empty = {
        query: input.query,
        currency,
        offers: [],
        excluded: {
          currencyMismatch: 0,
          unavailable: 0,
          invalidPrice: 0,
          invalidUrl: 0,
          duplicate: 0,
        },
        fetchedAt: now().toISOString(),
      };

      const supported = offerCurrencySchema.safeParse(currency);
      if (!supported.success) {
        return {
          ...empty,
          status: "UNSUPPORTED_CURRENCY",
          providerError: null,
        };
      }

      let products: Channel3Product[];
      try {
        products = await deps.channel3.search({
          query: input.query,
          currency: supported.data,
        });
      } catch (error) {
        if (!(error instanceof Channel3ApiError)) throw error;
        return { ...empty, status: "UNAVAILABLE", providerError: error.code };
      }

      const { offers, excluded } = normalizeOffers(products, currency);
      return {
        ...empty,
        status:
          offers.length >= MIN_COMPARABLE_OFFERS ? "OK" : "INSUFFICIENT_OFFERS",
        offers,
        excluded,
        providerError: null,
      };
    },
  };
}
