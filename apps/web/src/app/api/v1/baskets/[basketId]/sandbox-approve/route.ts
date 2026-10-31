import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  unauthorized,
} from "@/lib/api";
import { getPaymentService } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";
import { buyerApproves } from "@/lib/mock";

// Mock mode only: stands in for the buyer approving in PayPal Sandbox.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ basketId: string }> },
) {
  if (!isMockMode()) return apiError(404, "NOT_FOUND", "Not found.");
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const basketId = z.uuid().parse((await params).basketId);
    const basket = await getPaymentService().getBasket(userId, basketId);
    buyerApproves(basket.paypalOrderId);
    return NextResponse.json({ approved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
