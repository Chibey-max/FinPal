import { createPaymentSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  toPaymentResponse,
  unauthorized,
} from "@/lib/api";
import { getPaymentService } from "@/lib/backend";

// Creates the PayPal order for an approved decision. Responds with the
// payment in CREATED and the approveUrl the buyer must visit.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const input = createPaymentSchema.parse(await request.json());
    const payment = await getPaymentService().createPaymentOrder({
      userId,
      ...input,
    });
    return NextResponse.json(toPaymentResponse(payment), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
