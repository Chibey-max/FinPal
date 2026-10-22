import "server-only";

import type { CalendarEvent } from "@finpal/contracts";
import {
  PayPalApiError,
  type Channel3Client,
  type Channel3Product,
  type MerchantTrustChecker,
  type PayPalClient,
} from "@finpal/backend";

import { addDays, localDate, localWeekday, zonedToDate } from "@/lib/zoned";

import { getStore, now } from "./store";

// ---------------------------------------------------------------------------
// PayPal Sandbox (Orders v2 + Payments v2), including PayPal-Request-Id replay.

const ORDER_ALPHABET = "ABCDEFGHJKLMNPRSTUVWXY0123456789";

/** 17-character ids shaped like real PayPal order ids, e.g. 5O190127TN364715T. */
function paypalId() {
  return Array.from(
    { length: 17 },
    () => ORDER_ALPHABET[Math.floor(Math.random() * ORDER_ALPHABET.length)],
  ).join("");
}

async function replayable<T>(requestId: string, run: () => T): Promise<T> {
  const { replays } = getStore();
  if (replays.has(requestId)) return replays.get(requestId) as T;
  const result = run();
  replays.set(requestId, result);
  return result;
}

function order(orderId: string) {
  const found = getStore().orders.get(orderId);
  if (!found) {
    throw new PayPalApiError("Order not found", 404, "RESOURCE_NOT_FOUND");
  }
  return found;
}

export const paypal: PayPalClient = {
  createOrder: (input) =>
    replayable(`create:${input.requestId}`, () => {
      const orderId = paypalId();
      getStore().orders.set(orderId, { status: "PAYER_ACTION_REQUIRED" });
      return {
        orderId,
        status: "PAYER_ACTION_REQUIRED",
        approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
      };
    }),
  getOrder: async (orderId) => ({
    orderId,
    status: order(orderId).status,
    approveUrl: null,
  }),
  authorizeOrder: (orderId, requestId) =>
    replayable(`authorize:${requestId}`, () => {
      const found = order(orderId);
      if (found.status !== "APPROVED") {
        throw new PayPalApiError(
          "The buyer has not approved the order.",
          422,
          "ORDER_NOT_APPROVED",
          `dbg-${paypalId().slice(0, 12).toLowerCase()}`,
        );
      }
      found.status = "COMPLETED";
      found.authorizationId = paypalId();
      found.authorizationStatus = "CREATED";
      return {
        orderStatus: "COMPLETED",
        authorizationId: found.authorizationId,
        authorizationStatus: "CREATED",
      };
    }),
  captureAuthorization: (authorizationId, requestId) =>
    replayable(`capture:${requestId}`, () => {
      for (const found of getStore().orders.values()) {
        if (found.authorizationId === authorizationId) {
          found.authorizationStatus = "CAPTURED";
        }
      }
      return { captureId: paypalId(), captureStatus: "COMPLETED" };
    }),
  voidAuthorization: (authorizationId, requestId) =>
    replayable(`void:${requestId}`, () => {
      for (const found of getStore().orders.values()) {
        if (found.authorizationId === authorizationId) {
          found.authorizationStatus = "VOIDED";
        }
      }
      return { authorizationStatus: "VOIDED" };
    }),
  // Mock mode never receives real PayPal webhooks: fail closed, so a forged
  // request can never change a payment.
  verifyWebhookSignature: async () => false,
};

/** The buyer logs in to Sandbox checkout and clicks "Approve payment". */
export function buyerApproves(orderId: string) {
  const found = getStore().orders.get(orderId);
  if (found && found.status === "PAYER_ACTION_REQUIRED") {
    found.status = "APPROVED";
  }
}

// ---------------------------------------------------------------------------
// Channel3: a small fixed catalog. Some listings are deliberately unusable
// (used, out of stock, other currency, invalid link, duplicate) so the real
// normalization in @finpal/backend has something to exclude.

type Flag = "used" | "oos" | "gbp" | "badlink" | "dup";
type Listing = [merchant: string, price: number, flag?: Flag];

interface CatalogItem {
  title: string;
  keywords: string[];
  /** Generic words the shopping agent searches with, e.g. "headphones". */
  categories?: string[];
  listings: Listing[];
}

export const CATALOG: CatalogItem[] = [
  {
    title: "Sony WH-1000XM5",
    keywords: ["sony", "xm5", "wh-1000"],
    categories: ["headphones", "noise"],
    listings: [
      ["bestbuy.com", 349.99],
      ["amazon.com", 328],
      ["target.com", 339.99],
      ["crutchfield.com", 349.99],
      ["bhphotovideo.com", 329.99],
      ["ebay.com", 219, "used"],
      ["amazon.co.uk", 279, "gbp"],
      ["walmart.com", 319.99, "oos"],
      ["amazon.com", 328, "dup"],
    ],
  },
  {
    title: "Herman Miller Sayl chair",
    keywords: ["sayl", "herman"],
    categories: ["chair", "office"],
    listings: [
      ["dwr.com", 459],
      ["store.hermanmiller.com", 465],
      ["officedepot.com", 445],
      ["wayfair.com", 475],
      ["staples.com", 455],
      ["facebook.com", 220, "used"],
      ["chairshop.example", 399, "badlink"],
    ],
  },
  {
    title: "Dyson V15 Detect",
    keywords: ["dyson", "v15"],
    listings: [
      ["dyson.com", 649.99],
      ["bestbuy.com", 629],
      ["target.com", 669.99],
      ["amazon.com", 649],
      ["costco.com", 699.99],
      ["walmart.com", 599.99, "oos"],
    ],
  },
  {
    title: "Leica M6 leather strap",
    keywords: ["leica", "strap"],
    listings: [
      ["store.leica-camera.com", 189],
      ["etsy.com", 95, "used"],
      ["bhphotovideo.com", 179],
      ["bhphotovideo.com", 179, "dup"],
      ["leica-camera.co.uk", 159, "gbp"],
    ],
  },
  {
    title: "Anker 737 charger",
    keywords: ["anker", "737"],
    categories: ["charger", "power bank"],
    listings: [
      ["anker.com", 119.99],
      ["amazon.com", 109.99],
      ["bestbuy.com", 124.99],
      ["target.com", 114.99],
      ["walmart.com", 129.99],
    ],
  },
  {
    title: "Nintendo Switch OLED",
    keywords: ["switch", "nintendo"],
    listings: [
      ["nintendo.com", 349.99],
      ["gamestop.com", 349],
      ["amazon.com", 329.99],
      ["target.com", 349.99],
      ["walmart.com", 334.99],
    ],
  },
  {
    title: "Bose QuietComfort Ultra",
    keywords: ["bose", "quietcomfort"],
    categories: ["headphones", "noise"],
    listings: [
      ["bose.com", 429],
      ["bestbuy.com", 399],
      ["amazon.com", 379],
      ["target.com", 429],
      ["crutchfield.com", 429],
    ],
  },
  {
    title: "Logitech MX Master 3S",
    keywords: ["logitech", "mx master"],
    categories: ["mouse"],
    listings: [
      ["logitech.com", 99.99],
      ["amazon.com", 94.99],
      ["bestbuy.com", 99.99],
      ["target.com", 99.99],
      ["ebay.com", 59, "used"],
    ],
  },
  {
    title: "Kindle Paperwhite",
    keywords: ["kindle", "paperwhite"],
    categories: ["e-reader", "ereader", "reader"],
    listings: [
      ["amazon.com", 149.99],
      ["bestbuy.com", 159.99],
      ["target.com", 149.99],
      ["walmart.com", 154.99],
    ],
  },
  {
    title: "Apple AirPods Pro 2",
    keywords: ["airpods"],
    categories: ["earbuds"],
    listings: [
      ["apple.com", 249],
      ["amazon.com", 229],
      ["bestbuy.com", 239.99],
      ["target.com", 249.99],
      ["walmart.com", 229, "oos"],
    ],
  },
  {
    title: "Garmin Forerunner 265",
    keywords: ["garmin", "forerunner"],
    categories: ["running watch", "smartwatch"],
    listings: [
      ["garmin.com", 449.99],
      ["rei.com", 449.95],
      ["amazon.com", 429.99],
      ["bestbuy.com", 449.99],
    ],
  },
  {
    title: "Herman Miller Aeron chair",
    keywords: ["aeron"],
    categories: ["chair", "office"],
    listings: [
      ["store.hermanmiller.com", 1495],
      ["dwr.com", 1495],
      ["officedesigns.com", 1399],
      ["staples.com", 1529],
    ],
  },
];

function toProducts(item: CatalogItem): Channel3Product[] {
  return item.listings.map(([domain, price, flag], index) => {
    const productId =
      flag === "dup"
        ? `${item.keywords[0]}-${item.listings.findIndex(([d, , f]) => d === domain && f !== "dup")}`
        : `${item.keywords[0]}-${index}`;
    return {
      id: productId,
      title: item.title,
      offers: [
        {
          url:
            flag === "badlink"
              ? "javascript:void(0)"
              : `https://${domain}/p/${productId}`,
          domain,
          price,
          // Listings are USD (or GBP); other currencies are excluded, never converted.
          currency: flag === "gbp" ? "GBP" : "USD",
          availability: flag === "oos" ? "OutOfStock" : "InStock",
          condition: flag === "used" ? "used" : "new",
        },
      ],
    };
  });
}

export function findCatalogItem(query: string) {
  const key = query.toLowerCase();
  return CATALOG.find((item) => item.keywords.some((k) => key.includes(k)));
}

export const channel3: Channel3Client = {
  async search({ query }) {
    // A product name finds that product (the Quality Score lookup). A
    // category ("noise-cancelling headphones", the shopping agent) finds every
    // product in it. Unknown products: nothing comparable, so the backend
    // scores INSUFFICIENT_DATA and the proposal goes to manual review.
    const item = findCatalogItem(query);
    if (item) return toProducts(item);
    const key = query.toLowerCase();
    return CATALOG.filter((entry) =>
      entry.categories?.some((word) => key.includes(word)),
    ).flatMap(toProducts);
  },
};

// ---------------------------------------------------------------------------
// KERNEL merchant trust (simulated): the result is chosen on the proposal
// form, so every decision-table branch can be demonstrated.

export const trust: MerchantTrustChecker = {
  async check(proposal, references) {
    const signal = getStore().trust.get(proposal.id) ?? "NOT_CHECKED";
    // Same evidence shape as the KERNEL checker: the merchant it would visit.
    const offer = references[0];
    return {
      signal,
      evidence:
        signal === "NOT_CHECKED"
          ? { reason: "kernel_not_configured" }
          : {
              simulated: true,
              merchant: offer?.merchant ?? null,
              url: offer?.url ?? null,
            },
    };
  },
};

// ---------------------------------------------------------------------------
// Calendar: the coming week (Mon to Sun), in the user's timezone.

const WEEK_EVENTS = [
  { id: "evt_home_office", day: 0, time: "10:00", title: "Home office setup" },
  {
    id: "evt_dad_birthday",
    day: 2,
    time: "18:30",
    title: "Dad's birthday dinner",
  },
  { id: "evt_offsite_prep", day: 3, time: "09:00", title: "Team offsite prep" },
  { id: "evt_flight_nyc", day: 5, time: "11:00", title: "Flight to NYC" },
];

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** "YYYY-MM-DD" of the Monday that starts the coming week. */
export function upcomingMonday(timeZone: string) {
  const at = now();
  const today = localDate(at, timeZone);
  const index = WEEKDAY_INDEX[localWeekday(at, timeZone)] ?? 0;
  return index === 0 ? today : addDays(today, 7 - index);
}

export function calendarEvents(timeZone: string): CalendarEvent[] {
  const monday = upcomingMonday(timeZone);
  return WEEK_EVENTS.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: zonedToDate(
      addDays(monday, event.day),
      event.time,
      timeZone,
    ).toISOString(),
  }));
}
