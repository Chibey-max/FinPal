import { NextResponse, type NextRequest } from "next/server";

import { createTopUpSchema } from "@finpal/contracts";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getWalletTopUpService } from "@/lib/backend";

/** POST /api/v1/paypal/wallet/top-up — start Checkout to fund FinPal balance. */
export async function POST(request: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const body = createTopUpSchema.parse(await request.json());
    const session = await getWalletTopUpService().start(userId, body);
    return NextResponse.json(session);
  } catch (error) {
    return handleRouteError(error);
  }
}
