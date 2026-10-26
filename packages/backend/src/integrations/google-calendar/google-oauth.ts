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
          ? "The Google refresh token was revoked or has expired. Issue a new one."
          : `Google token refresh failed with ${response.status}.`,
        response.status,
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
