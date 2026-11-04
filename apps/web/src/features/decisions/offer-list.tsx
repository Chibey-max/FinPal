"use client";

import type { DecisionDetail } from "@finpal/contracts";
import { useState } from "react";

import { Pagination, paginate } from "@/components/pagination";
import { formatMoney } from "@/features/app/present";

const PAGE_SIZE = 5;

/** The offers a price was compared against, a few at a time. */
export function OfferList({
  offers,
}: {
  offers: DecisionDetail["evaluation"]["quality"]["references"];
}) {
  const [requested, setRequested] = useState(1);
  const { page, pageCount, start, end } = paginate(
    offers.length,
    requested,
    PAGE_SIZE,
  );

  if (!offers.length) {
    return (
      <span className="muted small">
        Channel3 returned no comparable offers.
      </span>
    );
  }
  return (
    <div className="stack-sm">
      <div className="offer-list">
        {offers.slice(start, end).map((offer) => (
          <div
            key={`${offer.merchant}|${offer.productId}`}
            className="offer-row"
          >
            <a
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate"
            >
              {offer.merchant}
            </a>
            <span className="mono">
              {formatMoney(offer.price, offer.currency)}
            </span>
            <span className="mono small" data-tone="ok">
              Usable
            </span>
          </div>
        ))}
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={offers.length}
        pageSize={PAGE_SIZE}
        label="offers"
        onPage={setRequested}
      />
    </div>
  );
}
