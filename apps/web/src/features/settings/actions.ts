"use server";

import { createSupabaseConstraintsRepository } from "@finpal/backend";
import { spendingConstraintsSchema } from "@finpal/contracts";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getServiceRoleAuditLog } from "@/lib/backend";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface SaveConstraintsState {
  status?: "saved" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function saveConstraints(
  _previous: SaveConstraintsState,
  input: unknown,
): Promise<SaveConstraintsState> {
  const user = await requireUser();

  const parsed = spendingConstraintsSchema.safeParse(input);
  if (!parsed.success) {
    // Key errors by path (e.g. "timeWindows.0.end") so the form can show them inline.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] ??= issue.message;
    }
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  try {
    // User-scoped client: RLS guarantees users can only write their own row.
    const supabase = await createServerSupabaseClient();
    await createSupabaseConstraintsRepository(supabase).save(
      user.id,
      parsed.data,
    );
    // Audit inserts require the service role (users cannot write audit_events).
    await getServiceRoleAuditLog().record({
      userId: user.id,
      entityType: "constraints",
      entityId: user.id,
      type: "CONSTRAINTS_UPDATED",
      payload: {
        currency: parsed.data.currency,
        timezone: parsed.data.timezone,
        timeWindowCount: parsed.data.timeWindows.length,
        dailyCap: parsed.data.amountCaps.daily ?? null,
        monthlyCap: parsed.data.amountCaps.monthly ?? null,
      },
    });
  } catch (error) {
    console.error("Saving constraints failed", error);
    return { status: "error", message: "Could not save. Please try again." };
  }

  revalidatePath("/settings");
  return { status: "saved", message: "Spending limits saved." };
}
