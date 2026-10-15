import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  paymentIdSchema,
  toPaymentResponse,
  unauthorized,
} from "@/lib/api";
import { getPaymentService } from "@/lib/backend";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const paymentId = paymentIdSchema.parse((await params).paymentId);
    const payment = await getPaymentService().capturePayment(userId, paymentId);
    return NextResponse.json(toPaymentResponse(payment));
  } catch (error) {
    return handleRouteError(error);
  }
}
