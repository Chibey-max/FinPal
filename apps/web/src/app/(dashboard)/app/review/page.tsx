import Link from "next/link";

import {
  DEFAULT_PAGE_SIZE,
  Pagination,
  paginate,
} from "@/components/pagination";

import {
  formatMoney,
  formatWhen,
  scoreLabel,
  scoreTone,
  shortId,
} from "@/features/app/present";
import { ReviewActions } from "@/features/review/review-actions";
import { requireUser } from "@/lib/auth";
import { getUserConstraints, getDecisionRows } from "@/lib/backend";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [rows, constraints] = await Promise.all([
    getDecisionRows(user.id),
    getUserConstraints(user.id),
  ]);
  const pending = rows.filter(
    (row) => row.outcome === "MANUAL_REVIEW" && row.reviewStatus === null,
  );
  const { page, pageCount, start, end } = paginate(
    pending.length,
    params.page,
    DEFAULT_PAGE_SIZE,
  );
  const timeZone = constraints?.timezone ?? "UTC";

  return (
    <div className="app-page">
      <div className="page-head__text">
        <h1>Review queue</h1>
        <p>
          Fair prices, missing evidence, or unavailable trust data land here.
          Approving makes the decision payable; rejecting closes it for good.
        </p>
      </div>

      {pending.length ? (
        <div className="stack-md">
          {pending.slice(start, end).map((row) => (
            <article key={row.decisionId} className="card review-card fade-in">
              <div className="stack-xs">
                <span className="mono small ink4">
                  {shortId("decision", row.decisionId)} ·{" "}
                  {formatWhen(row.decidedAt, timeZone)}
                </span>
                <span className="review-card__name">{row.productName}</span>
                <span className="mono ink2">
                  {formatMoney(row.amount, row.currency)} ·{" "}
                  <span data-tone={scoreTone[row.qualityScore]}>
                    {scoreLabel(row.qualityScore)}
                  </span>{" "}
                  · median {formatMoney(row.medianPrice, row.currency)}
                </span>
              </div>
              <div className="code-chips">
                {row.reasonCodes.map((code) => (
                  <span key={code} className="code-chip">
                    {code}
                  </span>
                ))}
              </div>
              <ReviewActions decisionId={row.decisionId} />
            </article>
          ))}
          <Pagination
            page={page}
            pageCount={pageCount}
            total={pending.length}
            pageSize={DEFAULT_PAGE_SIZE}
            label="pending reviews"
            hrefFor={(p) => `/app/review?page=${p}`}
          />
        </div>
      ) : (
        <div className="empty-panel">
          <p>The queue is empty. Try the Manual review demo path.</p>
          <Link
            href="/app/proposals/new?preset=review"
            className="btn btn-outline"
          >
            Run Manual review
          </Link>
        </div>
      )}
    </div>
  );
}
