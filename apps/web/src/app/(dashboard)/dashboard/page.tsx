import { ActivityList } from "@/features/activity/activity-list";
import { requireUser } from "@/lib/auth";
import { getUserAuditLog } from "@/lib/backend";
import { cn } from "@/lib/utils";

// Shown after PayPal's return redirect (see /api/v1/payments/return).
function paymentNotice(params: {
  payment?: string;
  status?: string;
  code?: string;
}) {
  if (!params.payment) return null;
  if (params.payment === "cancelled") {
    return {
      tone: "warning",
      text: "PayPal checkout was cancelled. Nothing was charged.",
    };
  }
  if (params.payment === "error") {
    return {
      tone: "danger",
      text: `The payment could not be completed (${params.code ?? "unknown error"}).`,
    };
  }
  return {
    tone: "success",
    text: `Payment ${params.status === "AUTHORIZED" ? "authorized" : "updated"}.`,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; status?: string; code?: string }>;
}) {
  const user = await requireUser();
  const notice = paymentNotice(await searchParams);
  const { events } = await (
    await getUserAuditLog()
  ).listActivity(user.id, {
    limit: 50,
  });

  return (
    <main className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every proposal, decision and payment step, newest first. Records are
          permanent and cannot be edited.
        </p>
      </div>

      {notice ? (
        <p
          role="status"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            notice.tone === "success" &&
              "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
            notice.tone === "warning" &&
              "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
            notice.tone === "danger" &&
              "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <ActivityList events={events} />
    </main>
  );
}
