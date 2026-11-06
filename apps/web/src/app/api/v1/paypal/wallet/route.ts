import { NextResponse } from "next/server";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getSendFundsService } from "@/lib/backend";

/** The shared Sandbox wallet, and what this user can still send today. */
export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const wallet = await getSendFundsService().getWallet(userId);
    return NextResponse.json(wallet);
  } catch (error) {
    return handleRouteError(error);
  }
}
