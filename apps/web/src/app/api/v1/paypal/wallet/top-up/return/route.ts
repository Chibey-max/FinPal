import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getWalletTopUpService } from "@/lib/backend";

/**
 * After the buyer approves the top-up order in PayPal Sandbox.
 * Query: token = order id (PayPal), topUpId = our id.
 */
export async function GET(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  const origin = appOrigin(request.nextUrl.origin);
  const back = new URL("/app/send", origin);
  const orderId =
    request.nextUrl.searchParams.get("token") ??
    request.nextUrl.searchParams.get("orderId");
  const cancelled = request.nextUrl.searchParams.get("topup") === "cancelled";

  if (cancelled || !orderId) {
    back.searchParams.set("topup", "cancelled");
    return NextResponse.redirect(back);
  }

  try {
    await getWalletTopUpService().complete(userId, orderId);
    back.searchParams.set("topup", "ok");
  } catch (error) {
    console.error("Wallet top-up return failed", error);
    back.searchParams.set("topup", "failed");
  }
  return NextResponse.redirect(back);
}
