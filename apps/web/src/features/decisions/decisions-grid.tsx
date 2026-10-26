"use client";

import type { DecisionOutcome, DecisionRow } from "@finpal/contracts";
import type {
  ColDef,
  GetRowIdParams,
  GridApi,
  ICellRendererParams,
  IRowNode,
  RowClassRules,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/pagination";
import { gridTheme } from "@/features/app/grid-theme";
import {
  formatMoney,
  formatWhen,
  outcomeTone,
  paymentTone,
  scoreLabel,
  scoreTone,
  shortId,
  sourceLabel,
} from "@/features/app/present";

const OUTCOMES: { key: DecisionOutcome | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AUTO_APPROVE", label: "Auto-approve" },
  { key: "MANUAL_REVIEW", label: "Review" },
  { key: "BLOCK", label: "Blocked" },
];

type Cell<K extends keyof DecisionRow> = ICellRendererParams<
  DecisionRow,
  DecisionRow[K]
>;

function QualityCell({ data }: Cell<"qualityScore">) {
  if (!data) return null;
  return (
    <span className="mono small" data-tone={scoreTone[data.qualityScore]}>
      {scoreLabel(data.qualityScore)}
    </span>
  );
}

function OutcomeCell({ data }: Cell<"outcome">) {
  if (!data) return null;
  return (
    <span className="chip" data-tone={outcomeTone[data.outcome]}>
      {data.reviewStatus ? `REVIEW · ${data.reviewStatus}` : data.outcome}
    </span>
  );
}

function PaymentCell({ data }: Cell<"paymentStatus">) {
  if (!data?.paymentStatus) return <span className="ink4">—</span>;
  return (
    <span className="mono small" data-tone={paymentTone[data.paymentStatus]}>
      {data.paymentStatus}
    </span>
  );
}

/** What the grid's quick search matches: the text a row shows. */
function searchText(row: DecisionRow, timeZone: string) {
  return [
    shortId("decision", row.decisionId),
    formatWhen(row.decidedAt, timeZone),
    row.productName,
    formatMoney(row.amount, row.currency),
    scoreLabel(row.qualityScore),
    row.source === "CALENDAR" ? "Calendar" : "Manual",
    row.reviewStatus ? `REVIEW · ${row.reviewStatus}` : row.outcome,
    row.paymentStatus ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * The same decisions as a list of cards, for phones where the table would
 * need sideways scrolling. Filtered and paged like the grid; CSS shows one or
 * the other.
 */
function DecisionCards({
  rows,
  selectedId,
  timeZone,
  page,
  onPage,
  onOpen,
}: {
  rows: DecisionRow[];
  selectedId: string | null;
  timeZone: string;
  page: number;
  onPage: (page: number) => void;
  onOpen: (row: DecisionRow) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="decision-cards">
      {shown.length ? (
        <ul className="decision-card-list">
          {shown.map((row) => (
            <li key={row.decisionId}>
              <button
                type="button"
                className="decision-card"
                aria-current={
                  row.decisionId === selectedId ? "true" : undefined
                }
                onClick={() => onOpen(row)}
              >
                <span className="decision-card__line">
                  <span className="decision-card__name">{row.productName}</span>
                  <span className="mono">
                    {formatMoney(row.amount, row.currency)}
                  </span>
                </span>
                <span className="decision-card__line">
                  <span className="chip" data-tone={outcomeTone[row.outcome]}>
                    {row.reviewStatus
                      ? `REVIEW · ${row.reviewStatus}`
                      : row.outcome}
                  </span>
                  <span
                    className="mono small"
                    data-tone={scoreTone[row.qualityScore]}
                  >
                    {scoreLabel(row.qualityScore)}
                  </span>
                </span>
                <span className="decision-card__line mono small ink4">
                  <span>
                    {shortId("decision", row.decisionId)} ·{" "}
                    {formatWhen(row.decidedAt, timeZone)}
                  </span>
                  {row.paymentStatus ? (
                    <span data-tone={paymentTone[row.paymentStatus]}>
                      {row.paymentStatus}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="decision-cards__empty">No decisions match this search.</p>
      )}
      <Pagination
        page={current}
        pageCount={pageCount}
        total={rows.length}
        pageSize={PAGE_SIZE}
        label="decisions"
        onPage={onPage}
      />
    </div>
  );
}

/**
 * Decisions dashboard on AG Grid: quick search, outcome filter, sortable and
 * filterable columns, paged with the shared pagination control. Selecting a
 * row opens its evidence below via the URL.
 */
// Stable grid options. Passing a new object or function on every render makes
// AG Grid refresh, and with the paging sync that became an endless render
// loop that also starved page navigation (React could never commit it).
const DEFAULT_COL_DEF: ColDef<DecisionRow> = {
  sortable: true,
  resizable: true,
  suppressMovable: true,
};
const getRowId = (params: GetRowIdParams<DecisionRow>) =>
  params.data.decisionId;

export function DecisionsGrid({
  rows,
  selectedId,
  timeZone,
}: {
  rows: DecisionRow[];
  selectedId: string | null;
  timeZone: string;
}) {
  const router = useRouter();
  const apiRef = useRef<GridApi<DecisionRow> | null>(null);
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<DecisionOutcome | "ALL">("ALL");
  const [cardPage, setCardPage] = useState(1);
  const [paging, setPaging] = useState({
    page: 1,
    pageCount: 1,
    total: rows.length,
  });

  const open = useCallback(
    (row: DecisionRow | undefined) => {
      if (row)
        router.push(`/app/decisions/${row.decisionId}`, { scroll: false });
    },
    [router],
  );

  const columns = useMemo<ColDef<DecisionRow>[]>(
    () => [
      {
        headerName: "ID",
        field: "decisionId",
        width: 104,
        valueFormatter: (p) => (p.value ? shortId("decision", p.value) : ""),
        getQuickFilterText: (p) => shortId("decision", p.value),
        cellClass: "mono grid-muted",
      },
      {
        headerName: "Decided",
        field: "decidedAt",
        width: 130,
        sort: "desc",
        valueFormatter: (p) => formatWhen(p.value, timeZone),
        cellClass: "mono grid-muted",
      },
      {
        headerName: "Product",
        field: "productName",
        flex: 1,
        minWidth: 200,
        filter: "agTextColumnFilter",
        tooltipField: "productName",
      },
      {
        headerName: "Amount",
        field: "amount",
        width: 124,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => formatMoney(p.value, p.data?.currency ?? "USD"),
        cellClass: "mono",
      },
      {
        headerName: "Quality",
        field: "qualityScore",
        width: 130,
        cellRenderer: QualityCell,
      },
      {
        headerName: "Source",
        field: "source",
        width: 110,
        valueFormatter: (p) => (p.value ? sourceLabel(p.value) : ""),
        cellClass: "grid-muted",
      },
      {
        headerName: "Outcome",
        field: "outcome",
        width: 190,
        cellRenderer: OutcomeCell,
        getQuickFilterText: (p) =>
          `${p.value} ${p.data?.reviewStatus ?? ""}`.trim(),
      },
      {
        headerName: "Payment",
        field: "paymentStatus",
        width: 130,
        cellRenderer: PaymentCell,
      },
    ],
    [timeZone],
  );

  // Only update when a number changed: a new object on every grid event
  // would re-render, refresh the grid and fire the event again, forever.
  const syncPaging = useCallback((api: GridApi<DecisionRow>) => {
    const next = {
      page: api.paginationGetCurrentPage() + 1,
      pageCount: Math.max(1, api.paginationGetTotalPages()),
      total: api.getDisplayedRowCount(),
    };
    setPaging((prev) =>
      prev.page === next.page &&
      prev.pageCount === next.pageCount &&
      prev.total === next.total
        ? prev
        : next,
    );
  }, []);

  const rowClassRules = useMemo<RowClassRules<DecisionRow>>(
    () => ({
      "grid-row-selected": (params) => params.data?.decisionId === selectedId,
    }),
    [selectedId],
  );

  // Open on the page that holds the selected decision.
  const showSelected = useCallback(
    (api: GridApi<DecisionRow>) => {
      if (!selectedId) return;
      const node = api.getRowNode(selectedId);
      if (node?.rowIndex != null) {
        api.paginationGoToPage(Math.floor(node.rowIndex / DEFAULT_PAGE_SIZE));
      }
    },
    [selectedId],
  );

  const isExternalFilterPresent = useCallback(
    () => outcome !== "ALL",
    [outcome],
  );
  const doesExternalFilterPass = useCallback(
    (node: IRowNode<DecisionRow>) => node.data?.outcome === outcome,
    [outcome],
  );

  return (
    <section className="card grid-card stack-flush" aria-label="Decisions">
      <div className="grid-toolbar">
        <input
          type="search"
          className="input grid-search"
          placeholder="Search product, outcome, ID…"
          aria-label="Search decisions"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCardPage(1);
          }}
        />
        <div
          className="segmented segmented--quiet"
          role="group"
          aria-label="Filter by outcome"
        >
          {OUTCOMES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={outcome === option.key}
              onClick={() => {
                setOutcome(option.key);
                setCardPage(1);
                // AG Grid reads external filters lazily.
                requestAnimationFrame(() => apiRef.current?.onFilterChanged());
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <DecisionCards
        rows={cardRows}
        selectedId={selectedId}
        timeZone={timeZone}
        page={cardPage}
        onPage={setCardPage}
        onOpen={open}
      />
      <div className="grid-scroll">
        <div className="grid-inner grid-inner--decisions">
          <AgGridReact<DecisionRow>
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={DEFAULT_COL_DEF}
            getRowId={getRowId}
            domLayout="autoHeight"
            pagination
            paginationPageSize={DEFAULT_PAGE_SIZE}
            // The shared <Pagination> below renders the controls.
            paginationPageSizeSelector={false}
            suppressPaginationPanel
            quickFilterText={search}
            isExternalFilterPresent={isExternalFilterPresent}
            doesExternalFilterPass={doesExternalFilterPass}
            rowClassRules={rowClassRules}
            rowClass="grid-row-link"
            tooltipShowDelay={400}
            overlayNoRowsTemplate="No decisions match this search."
            onGridReady={(event) => {
              apiRef.current = event.api;
            }}
            onFirstDataRendered={(event) => {
              showSelected(event.api);
              syncPaging(event.api);
            }}
            onPaginationChanged={(event) => syncPaging(event.api)}
            onRowClicked={(event) => open(event.data)}
            onCellKeyDown={(event) => {
              const key = (event.event as KeyboardEvent | undefined)?.key;
              if (key === "Enter") open(event.data);
            }}
          />
        </div>
      </div>
      <div className="grid-footer">
        <Pagination
          page={paging.page}
          pageCount={paging.pageCount}
          total={paging.total}
          pageSize={DEFAULT_PAGE_SIZE}
          label="decisions"
          onPage={(page) => apiRef.current?.paginationGoToPage(page - 1)}
        />
      </div>
    </section>
  );
}
