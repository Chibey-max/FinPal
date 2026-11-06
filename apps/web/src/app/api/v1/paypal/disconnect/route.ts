import { NextResponse, type NextRequest } from "next/server";

import { getApiUserId, unauthorized } from "@/lib/api";
import { appOrigin } from "@/lib/app-origin";
import { getPaypalConnectionService } from "@/lib/backend";

/** POST /api/v1/paypal/disconnect */
export async function POST(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  await getPaypalConnectionService().disconnect(userId);
  const back = new URL("/app/settings", appOrigin(request.nextUrl.origin));
  back.searchParams.set("paypal", "disconnected");
  return NextResponse.redirect(back, 303);
}
