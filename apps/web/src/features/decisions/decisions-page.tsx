import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { requireUser } from "@/lib/auth";
import {
  getAssistantService,
  getUserConstraints,
  getUserDashboard,
  getUserDecisionDetail,
} from "@/lib/backend";

import { DecisionsGrid } from "./decisions-grid";
import { DecisionDetailView } from "./decisions-screen";

/** /app/decisions and /app/decisions/[id]: the grid plus one decision's evidence. */
export async function DecisionsPage({
  selectedId,
}: {
  selectedId: string | null;
}) {
  const user = await requireUser();
  if (selectedId !== null && !z.uuid().safeParse(selectedId).success)
    notFound();

  const [rows, constraints, details] = await Promise.all([
    getUserDashboard().then((d) => d.listDecisionRows(user.id, { limit: 200 })),
    getUserConstraints(user.id),
    getUserDecisionDetail(),
  ]);
  // Rows arrive newest first; without a selection, show the latest.
  const activeId = selectedId ?? rows[0]?.decisionId ?? null;
  const detail = activeId
    ? await details.getDecisionDetail(user.id, activeId)
    : null;
  if (selectedId && !detail) notFound();
  const timeZone = constraints?.timezone ?? "UTC";

  return (
    <div className="app-page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Decisions</h1>
          <p>
            Every evaluation, its evidence and the rule that decided it. Select
            a row to inspect.
          </p>
        </div>
        <LiquidButton asChild size="lg" className="rounded-full">
          <Link href="/app/proposals/new">New proposal</Link>
        </LiquidButton>
      </div>

      {rows.length ? (
        <DecisionsGrid rows={rows} selectedId={activeId} timeZone={timeZone} />
      ) : (
        <div className="empty-panel">
          <p>
            No decisions yet. Every evaluated proposal lands here with its
            evidence.
          </p>
          <Link
            href="/app/proposals/new?preset=auto"
            className="btn btn-outline"
          >
            Run the auto-approve path
          </Link>
        </div>
      )}

      {detail ? (
        <DecisionDetailView
          detail={detail}
          timeZone={timeZone}
          summary={getAssistantService().configured}
        />
      ) : null}
    </div>
  );
}
