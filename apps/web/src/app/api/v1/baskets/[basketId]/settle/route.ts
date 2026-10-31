import { basketSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getPaymentService } from "@/lib/backend";

// POST /api/v1/baskets/:basketId/settle
// Confirms the approval with PayPal, then authorizes and captures every item.
// Safe to retry: finished steps are skipped.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ basketId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const basketId = z.uuid().parse((await params).basketId);
    const basket = await getPaymentService().settleBasket(userId, basketId);
    return NextResponse.json(basketSchema.parse(basket));
  } catch (error) {
    return handleRouteError(error);
  }
}
