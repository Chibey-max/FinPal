import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  paymentIdSchema,
  toPaymentResponse,
  unauthorized,
} from "@/lib/api";
import { getPaymentService } from "@/lib/backend";

// Voids an AUTHORIZED payment. Captured payments are rejected: reversing a
// capture is a refund, never a void.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const paymentId = paymentIdSchema.parse((await params).paymentId);
    const payment = await getPaymentService().voidPayment(userId, paymentId);
    return NextResponse.json(toPaymentResponse(payment));
  } catch (error) {
    return handleRouteError(error);
  }
}
