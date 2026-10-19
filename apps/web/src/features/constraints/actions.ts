"use server";

import {
  spendingConstraintsSchema,
  type SpendingConstraintsInput,
} from "@finpal/contracts";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { saveUserConstraints } from "@/lib/backend";

export interface SaveConstraintsState {
  status?: "saved" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Bumped on every save so the form can react to repeat results. */
  at?: number;
}

/** Saves constraints, or clears them when `input` is null ("Not configured"). */
export async function saveConstraints(
  _previous: SaveConstraintsState,
  input: SpendingConstraintsInput | null,
): Promise<SaveConstraintsState> {
  const user = await requireUser();
  const at = Date.now();

  let constraints = null;
  if (input) {
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
        at,
      };
    }
    constraints = parsed.data;
  }

  try {
    await saveUserConstraints(user.id, constraints);
  } catch (error) {
    console.error("Saving constraints failed", error);
    return {
      status: "error",
      message:
        error instanceof Error && error.message.includes("not supported")
          ? error.message
          : "Could not save. Please try again.",
      at,
    };
  }

  revalidatePath("/app", "layout");
  return {
    status: "saved",
    message: constraints
      ? "Constraints saved. They apply to new proposals."
      : "Constraints cleared. Every new proposal goes to manual review.",
    at,
  };
}
