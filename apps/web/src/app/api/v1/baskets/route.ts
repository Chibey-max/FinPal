import { basketSchema, createBasketSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getPaymentService } from "@/lib/backend";

// POST /api/v1/baskets  { decisionIds, idempotencyKey }
// One PayPal order for every approved item. The total is checked against the
// caps. Responds with the approveUrl the buyer must visit once.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const input = createBasketSchema.parse(await request.json());
    const basket = await getPaymentService().createBasketOrder({
      userId,
      ...input,
    });
    return NextResponse.json(basketSchema.parse(basket), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
