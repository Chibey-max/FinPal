import { z } from "zod";

/** PRD: fewer than 3 usable comparable offers means "Insufficient data". */
export const MIN_COMPARABLE_OFFERS = 3;

/** Currencies Channel3 can price in. Others cannot be compared. */
export const offerCurrencySchema = z.enum([
  "USD",
  "CAD",
  "AUD",
  "GBP",
  "EUR",
  "SEK",
  "CZK",
  "RON",
]);

export type OfferCurrency = z.infer<typeof offerCurrencySchema>;

/** One merchant listing, normalized from Channel3 into a single currency. */
export const comparableOfferSchema = z.object({
  productId: z.string(),
  title: z.string(),
  merchant: z.string(),
  price: z.number().positive(),
  currency: z.string().length(3),
  url: z.string(),
});

export type ComparableOffer = z.infer<typeof comparableOfferSchema>;

/**
 * OK: at least MIN_COMPARABLE_OFFERS usable offers.
 * INSUFFICIENT_OFFERS: provider answered, but too few usable offers.
 * UNSUPPORTED_CURRENCY: the proposal's currency cannot be priced.
 * UNAVAILABLE: timeout, quota, auth or provider error.
 * Every status except OK leads to Quality Score "Insufficient data".
 */
export const offerLookupStatusSchema = z.enum([
  "OK",
  "INSUFFICIENT_OFFERS",
  "UNSUPPORTED_CURRENCY",
  "UNAVAILABLE",
]);

export type OfferLookupStatus = z.infer<typeof offerLookupStatusSchema>;

export const offerLookupSchema = z.object({
  status: offerLookupStatusSchema,
  query: z.string(),
  currency: z.string().length(3),
  /** Usable offers, cheapest first. */
  offers: z.array(comparableOfferSchema),
  /** Why listings returned by the provider were not used. */
  excluded: z.object({
    currencyMismatch: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    invalidPrice: z.number().int().nonnegative(),
    invalidUrl: z.number().int().nonnegative(),
    duplicate: z.number().int().nonnegative(),
  }),
  /** Set when status is UNAVAILABLE, e.g. TIMEOUT, QUOTA_EXCEEDED. */
  providerError: z.string().nullable(),
  fetchedAt: z.string(),
});

export type OfferLookup = z.infer<typeof offerLookupSchema>;

export const offerLookupQuerySchema = z.object({
  query: z.string().trim().min(2).max(200),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase()),
});

export type OfferLookupQuery = z.infer<typeof offerLookupQuerySchema>;
