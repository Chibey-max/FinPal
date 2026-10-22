import { ConstraintsForm } from "@/features/constraints/constraints-form";
import { requireUser } from "@/lib/auth";
import { getSpendSummary, getUserConstraints } from "@/lib/backend";

export default async function ConstraintsPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);
  const spend = await getSpendSummary(user.id, constraints);

  return (
    <div className="app-page app-page--narrow">
      {/* No key: re-mounting on new values would drop the save result,
          so the "Constraints saved" toast would never show. */}
      <ConstraintsForm
        initial={constraints}
        timeZones={Intl.supportedValuesOf("timeZone")}
        spentToday={spend.spentToday}
        spentThisMonth={spend.spentThisMonth}
      />
    </div>
  );
}
