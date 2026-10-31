import { PaymentError } from "@finpal/backend";
import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId } from "@/lib/api";
import { getPaymentService } from "@/lib/backend";

// PayPal redirects the buyer here after approval with ?token=<orderId>.
// We confirm the approval with PayPal (never trusting the redirect alone),
// finish the payment, and send the user back to their purchases.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const dashboard = new URL("/app/purchases", origin);

  const userId = await getApiUserId();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const orderId = searchParams.get("token");
  if (!orderId) {
    dashboard.searchParams.set("payment", "error");
    dashboard.searchParams.set("code", "MISSING_ORDER");
    return NextResponse.redirect(dashboard);
  }

  try {
    const payment = await getPaymentService().completeApproval(userId, orderId);
    if (!payment.basketId) {
      dashboard.pathname = `/app/purchases/${payment.decisionId}`;
    }
    dashboard.searchParams.set("payment", "returned");
    dashboard.searchParams.set("status", payment.status);
  } catch (error) {
    if (!(error instanceof PaymentError)) {
      console.error("PayPal return failed", error);
    }
    dashboard.searchParams.set("payment", "error");
    dashboard.searchParams.set(
      "code",
      error instanceof PaymentError ? error.code : "INTERNAL_ERROR",
    );
  }
  return NextResponse.redirect(dashboard);
}
