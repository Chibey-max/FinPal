import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getSendFundsService } from "@/lib/backend";

const draftIdSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const { draftId } = await context.params;
    const draft = await getSendFundsService().getDraft(
      userId,
      draftIdSchema.parse(draftId),
    );
    return NextResponse.json(draft);
  } catch (error) {
    return handleRouteError(error);
  }
}
