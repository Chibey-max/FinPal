import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Pagination, paginate } from "@/components/pagination";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { requireUser } from "@/lib/auth";
import {
  getUserConstraints,
  getUserDashboard,
  getUserDecisionDetail,
} from "@/lib/backend";

import { DecisionDetailView, DecisionsTable } from "./decisions-screen";

/** /app/decisions and /app/decisions/[id]: the table plus one decision's evidence. */
const PAGE_SIZE = 8;

export async function DecisionsPage({
  selectedId,
  pageParam,
}: {
  selectedId: string | null;
  pageParam?: string;
}) {
  const user = await requireUser();
  if (selectedId !== null && !z.uuid().safeParse(selectedId).success)
    notFound();

  const [rows, constraints, details] = await Promise.all([
    getUserDashboard().then((d) => d.listDecisionRows(user.id, { limit: 200 })),
    getUserConstraints(user.id),
    getUserDecisionDetail(),
  ]);
  // Without ?page, open the page that contains the selected decision.
  const selectedIndex = selectedId
    ? rows.findIndex((r) => r.decisionId === selectedId)
    : -1;
  const { page, pageCount, start, end } = paginate(
    rows.length,
    pageParam ??
      (selectedIndex >= 0 ? Math.floor(selectedIndex / PAGE_SIZE) + 1 : 1),
    PAGE_SIZE,
  );
  const pageRows = rows.slice(start, end);
  const activeId = selectedId ?? pageRows[0]?.decisionId ?? null;
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
        <div className="stack-md">
          <DecisionsTable rows={pageRows} selectedId={activeId} page={page} />
          <Pagination
            page={page}
            pageCount={pageCount}
            total={rows.length}
            pageSize={PAGE_SIZE}
            label="decisions"
            hrefFor={(p) => `/app/decisions?page=${p}`}
          />
        </div>
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
        <DecisionDetailView detail={detail} timeZone={timeZone} />
      ) : null}
    </div>
  );
}
