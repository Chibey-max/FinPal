import type { AuditEvent } from "@finpal/contracts";

import { cn } from "@/lib/utils";

import { describeEvent, type EventTone } from "./describe-event";

const toneClasses: Record<EventTone, string> = {
  success:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  danger: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  neutral: "bg-muted text-muted-foreground",
};

const timestamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Interim activity list; the AG Grid dashboard replaces it. */
export function ActivityList({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        No activity yet. Proposals, decisions and payments will appear here.
      </p>
    );
  }

  return (
    <ol className="divide-y rounded-md border">
      {events.map((event) => {
        const { title, detail, tone } = describeEvent(event);
        return (
          <li
            key={event.id}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <time
              dateTime={event.createdAt}
              className="text-muted-foreground w-40 shrink-0 text-xs tabular-nums"
            >
              {timestamp.format(new Date(event.createdAt))} UTC
            </time>
            <span
              className={cn(
                "w-fit shrink-0 rounded px-2 py-0.5 font-mono text-[11px] font-medium",
                toneClasses[tone],
              )}
            >
              {event.type}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{title}</p>
              {detail ? (
                <p className="text-muted-foreground truncate text-xs">
                  {detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
