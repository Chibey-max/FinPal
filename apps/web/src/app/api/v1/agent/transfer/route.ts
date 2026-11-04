import { transferRequestSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";

import {
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getTransferAgent } from "@/lib/backend";

// POST /api/v1/agent/transfer  { text, amount, currency, recipientEmail }
// The user confirmed these details. They become an AGENT proposal, which the
// spending rules then decide on. Paying still needs approval in PayPal.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`agent:${userId}`, 6, 60_000)) return rateLimited();

  try {
    const input = transferRequestSchema.parse(await request.json());
    return NextResponse.json(await getTransferAgent().submit(userId, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
