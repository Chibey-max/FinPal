"use client";

import type { DecisionDetail, PaymentAttempt } from "@finpal/contracts";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { describeEvent } from "@/features/activity/describe-event";
import { PayButton } from "@/features/proposals/decision-card";
import { cn } from "@/lib/utils";

import {
  formatDateTime,
  formatMoney,
  outcomeTone,
  paymentTone,
  qualityTone,
  toneClasses,
  type Tone,
} from "./format";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; detail: DecisionDetail };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body?.error?.message ?? `Request failed (${response.status}).`,
    );
  }
  return body as T;
}

function Badge({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[11px] font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{value ?? "–"}</dd>
    </div>
  );
}

function PaymentActions({
  detail,
  onDone,
}: {
  detail: DecisionDetail;
  onDone: () => void;
}) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const payment = detail.payment;

  async function act(action: "authorize" | "capture" | "void") {
    if (
      action === "void" &&
      !window.confirm("Void this authorization? The buyer will not be charged.")
    ) {
      return;
    }
    setPending(action);
    setError(undefined);
    try {
      await request(`/api/v1/payments/${payment!.id}/${action}`, {
        method: "POST",
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setPending(undefined);
    }
  }

  const canStartPayment =
    detail.decision.outcome === "AUTO_APPROVE" &&
    (!payment || payment.status === "VOIDED");

  return (
    <div className="grid gap-2">
      {canStartPayment ? <PayButton decisionId={detail.decision.id} /> : null}

      {payment?.status === "CREATED" ? (
        <div className="flex flex-wrap gap-2">
          {payment.approveUrl ? (
            <a
              href={payment.approveUrl}
              className="border-input hover:bg-accent inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium"
            >
              Open PayPal checkout
            </a>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(pending)}
            onClick={() => act("authorize")}
          >
            {pending === "authorize" ? "Checking…" : "Check approval"}
          </Button>
        </div>
      ) : null}

      {payment?.status === "AUTHORIZED" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={Boolean(pending)}
            onClick={() => act("capture")}
          >
            {pending === "capture" ? "Capturing…" : "Capture"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(pending)}
            onClick={() => act("void")}
          >
            {pending === "void" ? "Voiding…" : "Void"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PaymentFields({ payment }: { payment: PaymentAttempt }) {
  return (
    <dl className="grid gap-1">
      <Field
        label="PayPal order"
        value={`${payment.paypalOrderId} · ${payment.paypalOrderStatus ?? "–"}`}
      />
      {payment.paypalAuthorizationId ? (
        <Field
          label="Authorization"
          value={`${payment.paypalAuthorizationId} · ${payment.paypalAuthorizationStatus ?? "–"}`}
        />
      ) : null}
      {payment.paypalCaptureId ? (
        <Field
          label="Capture"
          value={`${payment.paypalCaptureId} · ${payment.paypalCaptureStatus ?? "–"}`}
        />
      ) : null}
      <Field label="Updated" value={formatDateTime(payment.updatedAt)} />
    </dl>
  );
}

function DetailBody({
  detail,
  onChanged,
}: {
  detail: DecisionDetail;
  onChanged: () => void;
}) {
  const { proposal, evaluation, decision, payment, events } = detail;
  const { quality, constraintCheck } = evaluation;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={outcomeTone[decision.outcome]}>{decision.outcome}</Badge>
          <Badge tone={qualityTone[quality.score]}>{quality.score}</Badge>
          {payment ? (
            <Badge tone={paymentTone[payment.status]}>{payment.status}</Badge>
          ) : null}
        </div>
        <p className="text-lg font-semibold">
          {proposal.productName} ·{" "}
          {formatMoney(proposal.proposedPrice, proposal.currency)}
        </p>
        <p className="text-muted-foreground text-xs">
          Decided {formatDateTime(decision.decidedAt)}
          {proposal.proposedFor
            ? ` · planned for ${formatDateTime(proposal.proposedFor)}`
            : ""}
        </p>
      </div>

      <Section title="Why">
        <ul className="grid gap-2">
          {decision.reasons.map((reason, index) => (
            <li key={index} className="flex gap-2 text-sm">
              <span className="bg-muted text-muted-foreground h-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase">
                {reason.source}
              </span>
              <span>{reason.message}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Price check">
        <p className="text-sm">{quality.explanation}</p>
        <dl className="grid gap-1">
          <Field
            label="Median"
            value={formatMoney(quality.medianPrice, quality.currency)}
          />
          <Field
            label="Lowest"
            value={formatMoney(quality.lowestPrice, quality.currency)}
          />
          <Field label="Comparable offers" value={String(quality.offerCount)} />
          <Field label="Lookup" value={quality.offerStatus} />
        </dl>
        {quality.references.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {quality.references.slice(0, 5).map((offer) => (
              <li
                key={`${offer.merchant}|${offer.productId}`}
                className="flex gap-3"
              >
                <span className="w-20 shrink-0 tabular-nums">
                  {formatMoney(offer.price, offer.currency)}
                </span>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  {offer.merchant}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Rules and trust">
        <dl className="grid gap-1">
          <Field
            label="Spending rules"
            value={constraintCheck?.constraints ?? "No limits set"}
          />
          <Field
            label="Caps"
            value={constraintCheck?.amount ?? "No limits set"}
          />
          <Field label="Merchant trust" value={evaluation.trustSignal} />
        </dl>
      </Section>

      <Section title="Payment">
        {payment ? (
          <PaymentFields payment={payment} />
        ) : (
          <p className="text-muted-foreground text-sm">No payment started.</p>
        )}
        <PaymentActions detail={detail} onDone={onChanged} />
      </Section>

      <Section title={`Audit trail (${events.length})`}>
        <ol className="grid gap-2">
          {events.map((event) => {
            const { title, detail: line, tone } = describeEvent(event);
            return (
              <li key={event.id} className="grid gap-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone={tone}>{event.type}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
                <span>
                  {title}
                  {line ? (
                    <span className="text-muted-foreground"> · {line}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}

/**
 * Side panel with everything behind one decision. Render with
 * key={decisionId} so each decision starts in its loading state.
 */
export function DecisionDrawer({
  decisionId,
  onClose,
  onChanged,
}: {
  decisionId: string;
  onClose: () => void;
  /** Called after a payment action so the grid can refresh. */
  onChanged: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Bumped to refetch, e.g. after a payment action or "Try again".
  const [version, setVersion] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let current = true;
    request<DecisionDetail>(`/api/v1/decisions/${decisionId}`).then(
      (detail) => {
        if (current) setState({ status: "loaded", detail });
      },
      (caught: unknown) => {
        if (current) {
          setState({
            status: "error",
            message:
              caught instanceof Error ? caught.message : "Could not load.",
          });
        }
      },
    );
    // Ignore a response that arrives after the drawer moved on.
    return () => {
      current = false;
    };
  }, [decisionId, version]);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Decision details"
        tabIndex={-1}
        className="bg-background relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l p-6 shadow-xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Decision details</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X aria-hidden />
          </Button>
        </div>

        {state.status === "loading" ? (
          <div className="grid gap-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-md" />
            ))}
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="grid gap-3">
            <p role="alert" className="text-destructive text-sm">
              {state.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => {
                setState({ status: "loading" });
                reload();
              }}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {state.status === "loaded" ? (
          <DetailBody
            detail={state.detail}
            onChanged={() => {
              reload();
              onChanged();
            }}
          />
        ) : null}
      </aside>
    </div>
  );
}
