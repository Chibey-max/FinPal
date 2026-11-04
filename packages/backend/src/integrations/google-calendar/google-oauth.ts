import { z } from "zod";

/** Returns a valid Google access token. `forceRefresh` discards any cache. */
export type GoogleAccessTokenProvider = (options?: {
  forceRefresh?: boolean;
}) => Promise<string>;

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    /** HTTP status from Google's token endpoint, or 0 if unreachable. */
    readonly status: number,
    /** Google cancelled the token: only connecting again can fix it. */
    readonly revoked = false,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export interface GoogleRefreshTokenOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Read-only: FinPal never changes a calendar. */
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

/** Google's consent page. `offline` and `consent` make it issue a refresh token. */
export function googleConsentUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: options.state,
  });
  return `${CONSENT_URL}?${params}`;
}

/** Trades the consent page's code for the user's refresh token. */
export async function exchangeGoogleCode(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  fetch?: typeof fetch;
}): Promise<string> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: options.redirectUri,
        code: options.code,
      }).toString(),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new GoogleAuthError("Google sign-in is unreachable.", 0);
  }
  const body = (await response.json().catch(() => ({}))) as {
    refresh_token?: string;
  };
  if (!response.ok || !body.refresh_token) {
    throw new GoogleAuthError(
      "Google didn't grant calendar access.",
      response.status,
    );
  }
  return body.refresh_token;
}

/** Tells Google to cancel the token. Best effort: it's deleted here anyway. */
export async function revokeGoogleToken(
  token: string,
  doFetch: typeof fetch = fetch,
): Promise<void> {
  await doFetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

/**
 * Exchanges a long-lived OAuth refresh token for short-lived access tokens
 * (about one hour), caching each until a minute before it expires. Concurrent
 * callers share one refresh request.
 */
export function createGoogleRefreshTokenProvider(
  options: GoogleRefreshTokenOptions,
): GoogleAccessTokenProvider {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 8_000;
  let cached: { token: string; expiresAt: number } | undefined;
  let inFlight: Promise<string> | undefined;

  async function refresh(): Promise<string> {
    let response: Response;
    try {
      response = await doFetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: options.clientId,
          client_secret: options.clientSecret,
          refresh_token: options.refreshToken,
        }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new GoogleAuthError("Google sign-in is unreachable.", 0);
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      // invalid_grant: the refresh token was revoked, or it expired (refresh
      // tokens of apps in "Testing" publishing status last 7 days).
      throw new GoogleAuthError(
        body.error === "invalid_grant"
          ? "Google cancelled the calendar connection. Connect it again."
          : `Google token refresh failed with ${response.status}.`,
        response.status,
        body.error === "invalid_grant",
      );
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new GoogleAuthError(
        "Google returned an unexpected token response.",
        response.status,
      );
    }
    cached = {
      token: parsed.data.access_token,
      expiresAt: now() + parsed.data.expires_in * 1000,
    };
    return cached.token;
  }

  return async ({ forceRefresh = false } = {}) => {
    if (forceRefresh) cached = undefined;
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    inFlight ??= refresh().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}

/** A fixed token, for quick local testing only: it expires after ~1 hour. */
export function staticGoogleAccessToken(
  token: string,
): GoogleAccessTokenProvider {
  return async () => token;
}
