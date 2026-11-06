import { createSendDraftSchema } from "@finpal/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUserId, handleRouteError, unauthorized } from "@/lib/api";
import { getSendFundsService } from "@/lib/backend";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Recent send drafts for the Send page history. */
export async function GET(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const url = new URL(request.url);
    const { limit } = listQuerySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const sends = await getSendFundsService().listSends(userId, limit);
    return NextResponse.json({ sends });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Create a Send draft from structured fields (or Agent free text). */
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();

  try {
    const input = createSendDraftSchema.parse(await request.json());
    const draft = await getSendFundsService().createDraft(userId, input);
    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
