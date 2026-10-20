"use client";

import type { ActivityPage, AuditEvent } from "@finpal/contracts";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useState } from "react";

import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast";
import { gridTheme } from "@/features/app/grid-theme";
import { formatWhen, shortId } from "@/features/app/present";
import { apiRequest, errorMessage } from "@/lib/api-client";

import { eventTypeTone, summarizeEvent } from "./describe-event";

const FILTERS = {
  All: null,
  Decisions: /PROPOSAL|EVALUATION|DECISION/,
  Payments: /PAYMENT|PAYPAL/,
  Config: /CONSTRAINTS/,
} as const;
type FilterKey = keyof typeof FILTERS;

const PAGE_SIZE = 15;

interface Row {
  id: number;
  at: string;
  type: AuditEvent["type"];
  tone: ReturnType<typeof eventTypeTone>;
  entity: string;
  detail: string;
}

function TypeCell(params: ICellRendererParams<Row, string>) {
  return (
    <span className="mono grid-type" data-tone={params.data?.tone}>
      {params.value}
    </span>
  );
}

export function ActivityGrid({
  initial,
  timeZone,
}: {
  initial: ActivityPage;
  timeZone: string;
}) {
  const toast = useToast();
  const [events, setEvents] = useState(initial.events);
  const [nextBefore, setNextBefore] = useState(initial.nextBefore);
  const [filter, setFilter] = useState<FilterKey>("All");
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState({ page: 1, pageCount: 1 });
  const gridRef = useRef<AgGridReact<Row>>(null);

  const rows = useMemo<Row[]>(() => {
    const pattern = FILTERS[filter];
    return events
      .filter((event) => !pattern || pattern.test(event.type))
      .map((event) => ({
        id: event.id,
        at: formatWhen(event.createdAt, timeZone),
        type: event.type,
        tone: eventTypeTone(event),
        entity: shortId(event.entityType, event.entityId),
        detail: summarizeEvent(event),
      }));
  }, [events, filter, timeZone]);

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      {
        field: "at",
        headerName: "Time",
        width: 130,
        sort: "desc",
        // Ids are append-only and monotonic: the true chronological order.
        comparator: (_a, _b, nodeA, nodeB) =>
          (nodeA.data?.id ?? 0) - (nodeB.data?.id ?? 0),
        cellClass: "mono grid-muted",
      },
      {
        field: "type",
        headerName: "Event",
        width: 230,
        cellRenderer: TypeCell,
      },
      {
        field: "entity",
        headerName: "Entity",
        width: 130,
        cellClass: "mono grid-entity",
      },
      {
        field: "detail",
        headerName: "Detail",
        flex: 1,
        minWidth: 240,
        sortable: false,
        tooltipField: "detail",
      },
    ],
    [],
  );

  async function loadOlder() {
    if (!nextBefore) return;
    setLoading(true);
    try {
      const page = await apiRequest<ActivityPage>(
        `/api/v1/activity?limit=100&before=${nextBefore}`,
      );
      setEvents((current) => [...current, ...page.events]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      toast(errorMessage(error), "bad");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Activity</h1>
          <p>
            Append-only audit events. {events.length}
            {nextBefore ? "+" : ""} recorded.
          </p>
        </div>
        <div
          className="segmented segmented--quiet"
          role="group"
          aria-label="Filter events"
        >
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
      <section className="card grid-card" aria-label="Audit events">
        <div className="grid-scroll">
          <div className="grid-inner">
            <AgGridReact<Row>
              ref={gridRef}
              theme={gridTheme}
              pagination
              paginationPageSize={PAGE_SIZE}
              // Our own <Pagination> renders the controls.
              paginationPageSizeSelector={false}
              suppressPaginationPanel
              onPaginationChanged={(event) =>
                setPaging({
                  page: event.api.paginationGetCurrentPage() + 1,
                  pageCount: Math.max(1, event.api.paginationGetTotalPages()),
                })
              }
              rowData={rows}
              columnDefs={columns}
              defaultColDef={{
                sortable: true,
                resizable: true,
                suppressMovable: true,
              }}
              getRowId={(params) => String(params.data.id)}
              domLayout="autoHeight"
              suppressCellFocus
              tooltipShowDelay={400}
              overlayNoRowsTemplate="No events for this filter yet."
            />
          </div>
        </div>
      </section>
      <Pagination
        page={paging.page}
        pageCount={paging.pageCount}
        total={rows.length}
        pageSize={PAGE_SIZE}
        label="events"
        onPage={(p) => gridRef.current?.api.paginationGoToPage(p - 1)}
      />
      {nextBefore && paging.page === paging.pageCount ? (
        <button
          type="button"
          className="btn btn-outline btn-sm align-start"
          onClick={loadOlder}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load older events"}
        </button>
      ) : null}
    </>
  );
}
