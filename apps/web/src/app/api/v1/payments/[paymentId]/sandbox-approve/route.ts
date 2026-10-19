import { NextResponse } from "next/server";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  paymentIdSchema,
  unauthorized,
} from "@/lib/api";
import { getPaymentService } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";
import { buyerApproves } from "@/lib/mock";

// Mock mode only: stands in for the buyer approving the order in PayPal
// Sandbox checkout. FinPal still confirms the approval with (simulated)
// PayPal before authorizing, exactly as on the real return redirect.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  if (!isMockMode()) return apiError(404, "NOT_FOUND", "Not found.");
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const paymentId = paymentIdSchema.parse((await params).paymentId);
    const payment = await getPaymentService().getPayment(userId, paymentId);
    buyerApproves(payment.paypalOrderId);
    return NextResponse.json({
      approved: true,
      paypalOrderId: payment.paypalOrderId,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
