import { ConstraintsForm } from "@/features/constraints/constraints-form";
import { requireUser } from "@/lib/auth";
import { getSpendSummary, getUserConstraints } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

export default async function ConstraintsPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);
  const spend = await getSpendSummary(user.id, constraints);

  return (
    <div className="app-page app-page--narrow">
      <ConstraintsForm
        key={JSON.stringify(constraints)}
        initial={constraints}
        timeZones={Intl.supportedValuesOf("timeZone")}
        spentToday={spend.spentToday}
        spentThisMonth={spend.spentThisMonth}
        canClear={isMockMode()}
      />
    </div>
  );
}
