import { createSupabaseConstraintsRepository } from "@finpal/backend";

import { ConstraintsForm } from "@/features/settings/constraints-form";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const constraints = await createSupabaseConstraintsRepository(supabase).get(
    user.id,
  );

  return (
    <main className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Spending limits
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          FinPal checks every purchase against these rules before it can be
          authorized.
          {constraints
            ? null
            : " You have not set any limits yet, so no purchase can be auto-approved."}
        </p>
      </div>
      <ConstraintsForm
        initial={constraints}
        timeZones={Intl.supportedValuesOf("timeZone")}
      />
    </main>
  );
}
