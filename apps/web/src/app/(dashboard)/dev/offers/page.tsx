import {
  MIN_COMPARABLE_OFFERS,
  offerCurrencySchema,
  offerLookupQuerySchema,
  type OfferLookup,
} from "@finpal/contracts";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth";
import { getComparableOffersService } from "@/lib/channel3";
import { cn } from "@/lib/utils";

const statusText: Record<OfferLookup["status"], string> = {
  OK: "Enough comparable offers for a Quality Score.",
  INSUFFICIENT_OFFERS: `Fewer than ${MIN_COMPARABLE_OFFERS} usable offers: Quality Score would be Insufficient data.`,
  UNSUPPORTED_CURRENCY:
    "Channel3 cannot price this currency: Quality Score would be Insufficient data.",
  UNAVAILABLE:
    "Channel3 could not be reached: Quality Score would be Insufficient data.",
};

async function lookup(params: { query?: string; currency?: string }) {
  const parsed = offerLookupQuerySchema.safeParse(params);
  if (!parsed.success) return null;
  try {
    return await getComparableOffersService().lookup(parsed.data);
  } catch (error) {
    if (error instanceof z.ZodError) return "MISSING_KEY" as const;
    throw error;
  }
}

/** Developer test page: shows the raw reference offers behind a Quality Score. */
export default async function OffersTestPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; currency?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const result = await lookup(params);
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amount,
    );

  return (
    <main className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reference offers (test)
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Raw Channel3 comparable offers, normalized to one currency. Offers in
          other currencies are excluded, never converted.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="query">Product</Label>
          <Input
            id="query"
            name="query"
            defaultValue={params.query ?? ""}
            placeholder="e.g. Sony WH-1000XM5"
            minLength={2}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            name="currency"
            defaultValue={params.currency ?? "USD"}
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {offerCurrencySchema.options.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </div>
        <Button type="submit">Look up</Button>
      </form>

      {result === "MISSING_KEY" ? (
        <p role="alert" className="text-destructive text-sm">
          CHANNEL3_API_KEY is not set. Add it to .env.local and restart.
        </p>
      ) : null}

      {result && result !== "MISSING_KEY" ? (
        <section className="grid gap-4">
          <div
            role="status"
            className={cn(
              "rounded-md border px-4 py-3 text-sm",
              result.status === "OK"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
            )}
          >
            <p className="font-medium">
              {result.status}
              {result.providerError ? ` (${result.providerError})` : ""}
            </p>
            <p>{statusText[result.status]}</p>
          </div>

          <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div>
              <dt className="inline">Usable: </dt>
              <dd className="inline">{result.offers.length}</dd>
            </div>
            {Object.entries(result.excluded).map(([reason, count]) => (
              <div key={reason}>
                <dt className="inline">Excluded {reason}: </dt>
                <dd className="inline">{count}</dd>
              </div>
            ))}
            <div>
              <dt className="inline">Fetched: </dt>
              <dd className="inline">{result.fetchedAt}</dd>
            </div>
          </dl>

          {result.offers.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground text-xs">
                  <tr>
                    <th className="px-3 py-2 font-medium">Price</th>
                    <th className="px-3 py-2 font-medium">Merchant</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.offers.map((offer) => (
                    <tr key={`${offer.merchant}|${offer.productId}`}>
                      <td className="px-3 py-2 tabular-nums">
                        {money(offer.price, offer.currency)}
                      </td>
                      <td className="px-3 py-2">{offer.merchant}</td>
                      <td className="px-3 py-2">
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {offer.title}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
