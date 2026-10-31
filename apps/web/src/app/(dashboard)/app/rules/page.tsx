import { ConstraintsForm } from "@/features/constraints/constraints-form";
import { requireUser } from "@/lib/auth";
import { getSpendSummary, getUserConstraints } from "@/lib/backend";

export default async function RulesPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);
  const spend = await getSpendSummary(user.id, constraints);

  return (
    <div className="app-page">
      <div className="rules-form">
        {/* No key: re-mounting on new values would drop the save result,
            so the "Rules saved" toast would never show. */}
        <ConstraintsForm
          initial={constraints}
          timeZones={Intl.supportedValuesOf("timeZone")}
          spentToday={spend.spentToday}
          spentThisMonth={spend.spentThisMonth}
        />
      </div>
    </div>
  );
}
