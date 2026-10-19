import { WebhookError } from "@finpal/backend";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { getPaypalWebhookService } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

function header(request: Request, name: string): string {
  return request.headers.get(name) ?? "";
}

// POST /api/webhooks/paypal
// Verified, idempotent PayPal Sandbox webhook receiver.
export async function POST(request: Request) {
  // Mock mode has no PayPal account to send or verify webhooks.
  if (isMockMode()) {
    return apiError(
      503,
      "NOT_CONFIGURED",
      "PayPal webhooks are not available with mock data.",
    );
  }
  try {
    const rawBody: unknown = await request.json();
    const result = await getPaypalWebhookService().handle(
      {
        authAlgo: header(request, "paypal-auth-algo"),
        certUrl: header(request, "paypal-cert-url"),
        transmissionId: header(request, "paypal-transmission-id"),
        transmissionSig: header(request, "paypal-transmission-sig"),
        transmissionTime: header(request, "paypal-transmission-time"),
      },
      rawBody,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WebhookError) {
      const status =
        error.code === "NOT_CONFIGURED"
          ? 503
          : error.code === "INVALID_SIGNATURE"
            ? 401
            : 400;
      return apiError(status, error.code, error.message);
    }
    console.error("PayPal webhook error", error);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong.");
  }
}
