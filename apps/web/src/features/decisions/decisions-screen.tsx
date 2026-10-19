import type { DecisionDetail, DecisionRow } from "@finpal/contracts";
import Link from "next/link";

import { LinkPending } from "@/components/navigation-feedback";

import {
  formatMoney,
  formatWhen,
  outcomeTone,
  scoreLabel,
  scoreTone,
  shortId,
  trustTone,
} from "@/features/app/present";

import { DecisionActions, type DecisionActionState } from "./decision-actions";
import {
  constraintChecklist,
  priceBand,
  ratioLabel,
  describeTrustEvidence,
  reasonCodes,
  trustDetail,
} from "./evidence";

export function DecisionsTable({
  rows,
  selectedId,
  page,
}: {
  rows: DecisionRow[];
  selectedId: string | null;
  page: number;
}) {
  return (
    <section className="card table-card" aria-label="Decisions">
      <div className="table-scroll">
        <div className="data-table decisions-table" role="table">
          <div className="data-table__head" role="row">
            {["ID", "Product", "Amount", "Quality", "Source", "Outcome"].map(
              (h) => (
                <span key={h} role="columnheader">
                  {h}
                </span>
              ),
            )}
          </div>
          {rows.map((row) => {
            const review = row.reviewStatus;
            return (
              <Link
                key={row.decisionId}
                role="row"
                href={`/app/decisions/${row.decisionId}${page > 1 ? `?page=${page}` : ""}`}
                scroll={false}
                className="data-table__row"
                aria-current={
                  row.decisionId === selectedId ? "true" : undefined
                }
              >
                <span className="mono small ink4">
                  {shortId("decision", row.decisionId)}
                  <LinkPending />
                </span>
                <span className="truncate">{row.productName}</span>
                <span className="mono ink2">
                  {formatMoney(row.amount, row.currency)}
                </span>
                <span
                  className="mono small"
                  data-tone={scoreTone[row.qualityScore]}
                >
                  {scoreLabel(row.qualityScore)}
                </span>
                <span className="small ink3">
                  {row.source === "CALENDAR" ? "Calendar" : "Manual"}
                </span>
                <span className="chip" data-tone={outcomeTone[row.outcome]}>
                  {review ? `REVIEW · ${review}` : row.outcome}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function actionState(detail: DecisionDetail): DecisionActionState {
  const { decision, payment } = detail;
  const review = decision.reviewStatus;
  if (payment) {
    return { kind: "payment", paymentId: payment.id, status: payment.status };
  }
  if (decision.outcome === "BLOCK") return { kind: "blocked" };
  if (decision.outcome === "MANUAL_REVIEW") {
    if (review === "REJECTED") return { kind: "rejected" };
    if (review !== "APPROVED") return { kind: "review" };
  }
  return { kind: "pay" };
}

export function DecisionDetailView({
  detail,
  timeZone,
}: {
  detail: DecisionDetail;
  timeZone: string;
}) {
  const { proposal, evaluation, decision } = detail;
  const review = decision.reviewStatus;
  const trustEvidence = describeTrustEvidence(evaluation.trustEvidence);
  const { quality } = evaluation;
  const tone = outcomeTone[decision.outcome];
  const band = priceBand(quality);
  const checks = constraintChecklist(evaluation.constraintCheck);
  const amount = formatMoney(proposal.proposedPrice, proposal.currency);

  return (
    <div className="decision-detail fade-in" key={decision.id}>
      <div className="detail-head">
        <div className="stack-sm">
          <span className="mono small ink4">
            {shortId("decision", decision.id)} ·{" "}
            {proposal.source === "CALENDAR"
              ? "calendar-assisted"
              : "manual entry"}{" "}
            · evaluated {formatWhen(decision.decidedAt, timeZone)}
          </span>
          <h2 className="detail-title">
            {proposal.productName} <span className="ink3">{amount}</span>
          </h2>
        </div>
        <span className="chip chip-lg" data-tone={tone}>
          {review ? `REVIEW · ${review}` : decision.outcome}
        </span>
      </div>
      <p className="detail-explanation">{decision.reason}</p>

      <div className="evidence-grid">
        <section
          className="card evidence-card span-2"
          aria-labelledby="evidence"
        >
          <div className="card-head card-head--flush">
            <h3 id="evidence">Price evidence · Channel3</h3>
            <span className="mono small ink2">
              median {formatMoney(quality.medianPrice, quality.currency)} ·
              ratio {ratioLabel(quality)} ·{" "}
              <span data-tone={scoreTone[quality.score]}>{quality.score}</span>
            </span>
          </div>
          {band ? (
            <div
              className="band"
              data-tone={scoreTone[quality.score]}
              role="img"
              aria-label={`Proposed ${amount} against a median of ${formatMoney(quality.medianPrice, quality.currency)}: ${quality.score}`}
            >
              <div
                className="band__zone band__zone--good"
                style={{ width: `${band.goodWidth}%` }}
              />
              <div
                className="band__zone band__zone--fair"
                style={{
                  left: `${band.goodWidth}%`,
                  width: `${band.fairWidth}%`,
                }}
              />
              <div
                className="band__zone band__zone--poor"
                style={{ left: `${band.poorLeft}%` }}
              />
              {band.dots.map((left, index) => (
                <div
                  key={index}
                  className="band__dot"
                  style={{ left: `${left}%` }}
                />
              ))}
              <div
                className="band__median"
                style={{ left: `${band.median}%` }}
              />
              <span
                className="band__label band__label--median"
                style={{ left: `${band.median}%` }}
              >
                median
              </span>
              <div
                className="band__proposed"
                style={{ left: `${band.proposed}%` }}
              />
              <span
                className="band__label band__label--proposed"
                style={{ left: `${band.proposed}%` }}
              >
                proposed
              </span>
            </div>
          ) : null}
          <p className="small ink3 evidence-note">{quality.explanation}</p>
          <div className="offer-list">
            {quality.references.map((offer) => (
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
            {quality.references.length === 0 ? (
              <span className="muted small">
                Channel3 returned no comparable offers.
              </span>
            ) : null}
          </div>
        </section>

        <div className="stack-md">
          <section className="card stack-card" aria-labelledby="checks">
            <h3 id="checks">Constraints and caps</h3>
            {checks.map((check) => (
              <div key={check.label} className="check-row">
                <span className="mono check-row__mark" data-tone={check.tone}>
                  {check.mark}
                </span>
                <div className="stack-xs">
                  <span>{check.label}</span>
                  <span className="small ink4">{check.detail}</span>
                </div>
              </div>
            ))}
          </section>
          <section
            className="card stack-card stack-card--tight"
            aria-labelledby="trust"
          >
            <h3 id="trust">Merchant trust · KERNEL</h3>
            <span
              className="mono"
              data-tone={trustTone[evaluation.trustSignal]}
            >
              {evaluation.trustSignal}
            </span>
            <span className="small ink4">
              {trustDetail[evaluation.trustSignal]}
            </span>
            {trustEvidence ? (
              <span className="mono small ink4">{trustEvidence}</span>
            ) : null}
          </section>
          <section className="card stack-card" aria-labelledby="codes">
            <h3 id="codes">Reason codes</h3>
            <div className="code-chips">
              {reasonCodes(decision, evaluation).map((code) => (
                <span key={code} className="code-chip">
                  {code}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>

      <DecisionActions decisionId={decision.id} state={actionState(detail)} />
    </div>
  );
}
