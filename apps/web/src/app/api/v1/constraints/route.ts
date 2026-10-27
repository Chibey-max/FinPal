import { spendingConstraintsSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  unauthorized,
} from "@/lib/api";
import { getUserConstraints, saveUserConstraints } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

// GET /api/v1/constraints
// The signed-in user's spending constraints, or null when none are configured.
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    return NextResponse.json({
      constraints: await getUserConstraints(userId),
      canClear: isMockMode(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

const putSchema = z.object({
  constraints: spendingConstraintsSchema.nullable(),
});

// PUT /api/v1/constraints  { constraints: SpendingConstraints | null }
// Saves constraints, or clears them with null. Records CONSTRAINTS_UPDATED.
// Validation errors come back keyed by path (e.g. "timeWindows.0.end") in
// `details.fieldErrors`, as the web form shows them.
export async function PUT(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        // Drop the leading "constraints" of the request wrapper so keys read
        // "timeWindows.0.end", as the web form's do.
        fieldErrors[issue.path.slice(1).join(".")] ??= issue.message;
      }
      return apiError(
        400,
        "INVALID_CONSTRAINTS",
        "Fix the highlighted fields.",
        {
          fieldErrors,
        },
      );
    }

    const { constraints } = parsed.data;
    try {
      await saveUserConstraints(userId, constraints);
    } catch (error) {
      // The live repository cannot delete constraints yet.
      if (error instanceof Error && error.message.includes("not supported")) {
        return apiError(422, "NOT_SUPPORTED", error.message);
      }
      throw error;
    }
    return NextResponse.json({ constraints });
  } catch (error) {
    return handleRouteError(error);
  }
}
