"use client";

import type { DecisionRow } from "@finpal/contracts";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";

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

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  wrapperBorderRadius: 8,
  spacing: 6,
});

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

type Cell<K extends keyof DecisionRow> = ICellRendererParams<
  DecisionRow,
  DecisionRow[K]
>;

export function DecisionsGrid({ rows }: { rows: DecisionRow[] }) {
  const columnDefs = useMemo<ColDef<DecisionRow>[]>(
    () => [
      {
        field: "decidedAt",
        headerName: "Decided",
        sort: "desc",
        width: 130,
        valueFormatter: (p) => formatDateTime(p.value),
      },
      {
        field: "productName",
        headerName: "Product",
        minWidth: 160,
        flex: 1,
        tooltipField: "productName",
      },
      {
        field: "amount",
        headerName: "Amount",
        type: "rightAligned",
        width: 110,
        valueFormatter: (p) => formatMoney(p.value, p.data?.currency ?? "USD"),
      },
      {
        field: "qualityScore",
        headerName: "Quality",
        width: 150,
        cellRenderer: (p: Cell<"qualityScore">) =>
          p.value ? <Badge tone={qualityTone[p.value]}>{p.value}</Badge> : null,
      },
      {
        field: "outcome",
        headerName: "Decision",
        width: 150,
        cellRenderer: (p: Cell<"outcome">) =>
          p.value ? <Badge tone={outcomeTone[p.value]}>{p.value}</Badge> : null,
      },
      {
        field: "paymentStatus",
        headerName: "Payment",
        width: 130,
        // Exact uppercase PayPal state model value, or "–" if never started.
        cellRenderer: (p: Cell<"paymentStatus">) =>
          p.value ? (
            <Badge tone={paymentTone[p.value]}>{p.value}</Badge>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
      {
        field: "reason",
        headerName: "Explanation",
        minWidth: 260,
        flex: 2,
        tooltipField: "reason",
      },
      {
        field: "medianPrice",
        headerName: "Median",
        type: "rightAligned",
        width: 110,
        valueFormatter: (p) => formatMoney(p.value, p.data?.currency ?? "USD"),
      },
      {
        field: "offerCount",
        headerName: "Offers",
        type: "rightAligned",
        width: 90,
      },
      { field: "trustSignal", headerName: "Trust", width: 130 },
      {
        field: "paymentUpdatedAt",
        headerName: "Payment updated",
        width: 150,
        valueFormatter: (p) => formatDateTime(p.value),
      },
      {
        field: "proposalCreatedAt",
        headerName: "Proposed",
        width: 130,
        valueFormatter: (p) => formatDateTime(p.value),
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<DecisionRow>>(
    () => ({ sortable: true, resizable: true }),
    [],
  );

  return (
    <div className="h-[560px] w-full">
      <AgGridReact<DecisionRow>
        theme={theme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(p) => p.data.decisionId}
        tooltipShowDelay={300}
        overlayNoRowsTemplate="No decisions yet. Create a purchase to see it here."
      />
    </div>
  );
}
