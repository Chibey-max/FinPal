import { ActivityGrid } from "@/features/activity/activity-grid";
import { requireUser } from "@/lib/auth";
import { getUserAuditLog, getUserConstraints } from "@/lib/backend";

export default async function ActivityPage() {
  const user = await requireUser();
  const [page, constraints] = await Promise.all([
    getUserAuditLog().then((log) => log.listActivity(user.id, { limit: 100 })),
    getUserConstraints(user.id),
  ]);

  return (
    <div className="app-page">
      <ActivityGrid initial={page} timeZone={constraints?.timezone ?? "UTC"} />
    </div>
  );
}
