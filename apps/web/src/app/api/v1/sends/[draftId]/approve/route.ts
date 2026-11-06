import { approveSendSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getSendFundsService } from "@/lib/backend";

const draftIdSchema = z.uuid();

/** Human Approve & pay → PayPal Payouts EMAIL. */
export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const { draftId } = await context.params;
    const body = approveSendSchema.parse({
      ...(await request.json()),
      draftId: draftIdSchema.parse(draftId),
    });
    const draft = await getSendFundsService().approve(
      userId,
      body.draftId,
      body.idempotencyKey,
    );
    return NextResponse.json(draft);
  } catch (error) {
    return handleRouteError(error);
  }
}
