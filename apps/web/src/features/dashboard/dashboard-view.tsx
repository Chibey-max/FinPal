"use client";

import {
  paymentStatusSchema,
  type DecisionOutcome,
  type DecisionRow,
} from "@finpal/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { DecisionDrawer } from "./decision-drawer";
import { DecisionsGrid } from "./decisions-grid";
import {
  countByOutcome,
  defaultFilters,
  hasActiveFilters,
  type DashboardFilters,
} from "./filters";

const outcomeOptions: { value: DecisionOutcome | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "AUTO_APPROVE", label: "Approved" },
  { value: "MANUAL_REVIEW", label: "Needs review" },
  { value: "BLOCK", label: "Blocked" },
];

// REFUNDED is in the state model but refunds are out of scope.
const paymentOptions = paymentStatusSchema.options.filter(
  (status) => status !== "REFUNDED",
);

export function DashboardView({ rows }: { rows: DecisionRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useMemo(() => countByOutcome(rows), [rows]);
  const close = useCallback(() => setOpenId(null), []);
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search product, reason, status…"
          aria-label="Search decisions"
          className="max-w-xs"
        />

        <div
          role="group"
          aria-label="Decision"
          className="flex rounded-md border p-0.5"
        >
          {outcomeOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.outcome === value}
              onClick={() => setFilters((f) => ({ ...f, outcome: value }))}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                filters.outcome === value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {label} <span className="opacity-70">{counts[value]}</span>
            </button>
          ))}
        </div>

        <select
          aria-label="Payment status"
          value={filters.payment}
          onChange={(event) =>
            setFilters((f) => ({
              ...f,
              payment: event.target.value as DashboardFilters["payment"],
            }))
          }
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="ALL">Any payment</option>
          <option value="NONE">No payment yet</option>
          {paymentOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        {hasActiveFilters(filters) || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(defaultFilters);
              setSearch("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      <DecisionsGrid
        rows={rows}
        search={search}
        filters={filters}
        onOpen={setOpenId}
      />

      {openId ? (
        <DecisionDrawer
          key={openId}
          decisionId={openId}
          onClose={close}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}
