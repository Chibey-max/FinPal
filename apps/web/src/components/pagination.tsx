import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

/** One consistent density across FinPal's operational lists. */
export const DEFAULT_PAGE_SIZE = 10;

/** Page numbers with ellipses, e.g. 1 … 4 5 6 … 12. */
export function pageWindow(
  page: number,
  pageCount: number,
): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= pageCount - 2)
    [pageCount - 3, pageCount - 2, pageCount - 1].forEach((p) => pages.add(p));
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  return sorted.flatMap((p, i) =>
    i > 0 && p - sorted[i - 1]! > 1 ? ["gap" as const, p] : [p],
  );
}

/** Clamps a requested page and returns the slice bounds for it. */
export function paginate(total: number, requested: unknown, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const parsed = Number.parseInt(String(requested ?? "1"), 10);
  const page = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), pageCount)
    : 1;
  const start = (page - 1) * pageSize;
  return { page, pageCount, start, end: Math.min(start + pageSize, total) };
}

type Target =
  { hrefFor: (page: number) => string } | { onPage: (page: number) => void };

/**
 * Prev / numbered pages / next, plus "11–20 of 42". Renders links when given
 * `hrefFor` (URL-driven, server pages) or buttons with `onPage` (client).
 * Hidden when everything fits on one page.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  label = "items",
  ...target
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  label?: string;
} & Target) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const control = (
    to: number,
    content: ReactNode,
    props: { label: string; current?: boolean; disabled?: boolean },
  ) => {
    const common = {
      className: "page-control",
      "aria-label": props.label,
      "aria-current": props.current ? ("page" as const) : undefined,
    };
    if (props.disabled) {
      return (
        <span {...common} aria-disabled="true" data-disabled>
          {content}
        </span>
      );
    }
    return "hrefFor" in target ? (
      <Link {...common} href={target.hrefFor(to)} scroll={false}>
        {content}
      </Link>
    ) : (
      <button {...common} type="button" onClick={() => target.onPage(to)}>
        {content}
      </button>
    );
  };

  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <span className="pagination__range">
        {from}–{to} of {total} {label}
      </span>
      <div className="pagination__controls">
        {control(page - 1, <ChevronLeftIcon />, {
          label: "Previous page",
          disabled: page === 1,
        })}
        {pageWindow(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="pagination__gap" aria-hidden>
              …
            </span>
          ) : (
            <span key={item} className="pagination__item">
              {control(item, item, {
                label: `Page ${item}`,
                current: item === page,
              })}
            </span>
          ),
        )}
        {control(page + 1, <ChevronRightIcon />, {
          label: "Next page",
          disabled: page === pageCount,
        })}
      </div>
    </nav>
  );
}
