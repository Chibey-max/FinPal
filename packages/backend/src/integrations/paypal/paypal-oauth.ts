import { z } from "zod";

import { PayPalApiError } from "./paypal-client";

/**
 * Log in with PayPal (authorization code). Identity only — Payouts still use
 * the merchant client-credentials token.
 */

const TOKEN_PATH = "/v1/oauth2/token";
const USERINFO_PATH = "/v1/identity/oauth2/userinfo?schema=paypalv1.1";

/**
 * Scopes for Connect. Must match attributes enabled under Log in with PayPal →
 * Manage: Email, Account verification status, PayPal account ID (payer ID).
 * Do not request `profile` unless Full name is also checked there.
 */
export const PAYPAL_LOGIN_SCOPES = [
  "openid",
  "email",
  "https://uri.paypal.com/services/paypalattributes",
].join(" ");

export interface PaypalOAuthOptions {
  clientId: string;
  clientSecret: string;
  /** api-m.sandbox.paypal.com (or sandbox authorize host). */
  apiBaseUrl: string;
  redirectUri: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function authorizeHost(apiBaseUrl: string): string {
  // REST API host → browser consent host.
  if (apiBaseUrl.includes("sandbox")) {
    return "https://www.sandbox.paypal.com";
  }
  return "https://www.paypal.com";
}

export function paypalConsentUrl(
  options: PaypalOAuthOptions & { state: string },
): string {
  // Log in with PayPal uses /connect (not /signin/authorize).
  // https://developer.paypal.com/docs/log-in-with-paypal/integrate/
  const params = new URLSearchParams({
    flowEntry: "static",
    client_id: options.clientId,
    response_type: "code",
    scope: PAYPAL_LOGIN_SCOPES,
    redirect_uri: options.redirectUri,
    state: options.state,
  });
  return `${authorizeHost(options.apiBaseUrl)}/connect?${params}`;
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  token_type: z.string().optional(),
});

const userInfoSchema = z.object({
  user_id: z.string().min(1).optional(),
  payer_id: z.string().min(1).optional(),
  emails: z
    .array(
      z.object({
        value: z.string().email(),
        primary: z.boolean().optional(),
        confirmed: z.boolean().optional(),
      }),
    )
    .optional(),
  email: z.string().email().optional(),
});

function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export interface PaypalUserIdentity {
  refreshToken: string;
  accessToken: string;
  payerId: string;
  email: string;
}

export async function exchangePaypalCode(
  options: PaypalOAuthOptions & { code: string },
): Promise<PaypalUserIdentity> {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  let response: Response;
  try {
    response = await doFetch(`${options.apiBaseUrl}${TOKEN_PATH}`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(options.clientId, options.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: options.code,
        redirect_uri: options.redirectUri,
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new PayPalApiError("PayPal sign-in is unreachable.", 0, "NETWORK");
  }

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PayPalApiError(
      "PayPal didn't grant Log in with PayPal access.",
      response.status,
      "OAUTH_DENIED",
    );
  }
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.refresh_token) {
    throw new PayPalApiError(
      "PayPal returned no refresh token. Enable Log in with PayPal and request offline access on the Sandbox app.",
      response.status,
      "INVALID_RESPONSE",
    );
  }

  const profile = await fetchPaypalUserInfo({
    apiBaseUrl: options.apiBaseUrl,
    accessToken: parsed.data.access_token,
    fetch: doFetch,
    timeoutMs,
  });

  return {
    refreshToken: parsed.data.refresh_token,
    accessToken: parsed.data.access_token,
    payerId: profile.payerId,
    email: profile.email,
  };
}

async function fetchPaypalUserInfo(options: {
  apiBaseUrl: string;
  accessToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ payerId: string; email: string }> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${options.apiBaseUrl}${USERINFO_PATH}`, {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    });
  } catch {
    throw new PayPalApiError("PayPal profile is unreachable.", 0, "NETWORK");
  }
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PayPalApiError(
      "PayPal wouldn't share the connected profile.",
      response.status,
      "USERINFO_DENIED",
    );
  }
  const parsed = userInfoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PayPalApiError(
      "PayPal returned an unexpected profile.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  const payerId = parsed.data.payer_id ?? parsed.data.user_id;
  const email =
    parsed.data.email ??
    parsed.data.emails?.find((row) => row.primary)?.value ??
    parsed.data.emails?.[0]?.value;
  if (!payerId || !email) {
    throw new PayPalApiError(
      "PayPal profile was missing payer id or email.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return { payerId, email };
}

/** Best-effort revoke; connection is deleted locally either way. */
export async function revokePaypalToken(options: {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  token: string;
  fetch?: typeof fetch;
}): Promise<void> {
  const doFetch = options.fetch ?? fetch;
  await doFetch(`${options.apiBaseUrl}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(options.clientId, options.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      // Token revoke endpoint varies; Log in with PayPal often uses /v1/identity/openidconnect/tokenservice
    }).toString(),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);

  await doFetch(
    `${options.apiBaseUrl}/v1/identity/openidconnect/tokenservice`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuth(options.clientId, options.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: options.token,
        token_type_hint: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(8_000),
    },
  ).catch(() => undefined);
}
