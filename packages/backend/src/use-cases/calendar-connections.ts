import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { CalendarEventsPage } from "@finpal/contracts";

import {
  createGoogleCalendarHttpClient,
  GoogleCalendarApiError,
} from "../integrations/google-calendar/calendar-http-client";
import {
  createGoogleRefreshTokenProvider,
  exchangeGoogleCode,
  googleConsentUrl,
  revokeGoogleToken,
  type GoogleAccessTokenProvider,
} from "../integrations/google-calendar/google-oauth";
import type { CalendarConnectionRepository } from "../repositories/calendar-connection-repository";

// Each user connects their own Google Calendar. Google refresh tokens don't
// expire on a timer once the OAuth app is published, but a user can revoke
// access at any time, so a cancelled token is expected: it's recorded and the
// user gets a Reconnect button rather than an error.

export interface CalendarConnectionDeps {
  connections: CalendarConnectionRepository;
  clientId: string;
  clientSecret: string;
  /** This app's callback; must be listed on the Google OAuth client. */
  redirectUri: string;
  fetch?: typeof fetch;
  onError?: (error: unknown) => void;
}

export type CalendarConnectionService = ReturnType<
  typeof createCalendarConnectionService
>;

// The key comes from the OAuth client secret. A refresh token is useless
// without that secret anyway, so a database leak alone exposes neither.
const keyFrom = (secret: string) =>
  createHash("sha256").update(`finpal-calendar:${secret}`).digest();

export function encryptToken(token: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptToken(stored: string, secret: string): string {
  const [iv, tag, body] = stored.split(".");
  if (!iv || !tag || !body) throw new Error("Malformed stored token.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFrom(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

const notConnected: CalendarEventsPage = {
  events: [],
  configured: false,
  needsReconnect: false,
};
const reconnect: CalendarEventsPage = { ...notConnected, needsReconnect: true };

export function createCalendarConnectionService(deps: CalendarConnectionDeps) {
  const { connections, clientId, clientSecret, redirectUri } = deps;
  // One provider per stored token, so access tokens are reused between calls.
  const providers = new Map<string, GoogleAccessTokenProvider>();

  return {
    consentUrl: (state: string) =>
      googleConsentUrl({ clientId, redirectUri, state }),

    async complete(userId: string, code: string): Promise<void> {
      const token = await exchangeGoogleCode({
        clientId,
        clientSecret,
        redirectUri,
        code,
        fetch: deps.fetch,
      });
      providers.delete(userId);
      await connections.save(userId, encryptToken(token, clientSecret));
    },

    async disconnect(userId: string): Promise<void> {
      const connection = await connections.get(userId);
      if (!connection) return;
      providers.delete(userId);
      try {
        await revokeGoogleToken(
          decryptToken(connection.refreshTokenEncrypted, clientSecret),
          deps.fetch,
        );
      } catch (error) {
        deps.onError?.(error);
      }
      await connections.remove(userId);
    },

    /** A provider outage shows as "no events", never an error page. */
    async listUpcoming(
      userId: string,
      limit = 20,
    ): Promise<CalendarEventsPage> {
      const connection = await connections.get(userId);
      if (!connection) return notConnected;
      if (connection.needsReconnect) return reconnect;

      try {
        let provider = providers.get(userId);
        if (!provider) {
          provider = createGoogleRefreshTokenProvider({
            clientId,
            clientSecret,
            refreshToken: decryptToken(
              connection.refreshTokenEncrypted,
              clientSecret,
            ),
            fetch: deps.fetch,
          });
          providers.set(userId, provider);
        }
        const events = await createGoogleCalendarHttpClient({
          accessToken: provider,
          fetch: deps.fetch,
        }).listUpcomingEvents(limit);
        return { events, configured: true, needsReconnect: false };
      } catch (error) {
        const revoked =
          error instanceof GoogleCalendarApiError ? error.revoked : false;
        // Can't decrypt (the client secret changed): connecting again fixes it.
        const unreadable =
          error instanceof Error && !(error instanceof GoogleCalendarApiError);
        if (revoked || unreadable) {
          providers.delete(userId);
          await connections.markNeedsReconnect(userId);
          return reconnect;
        }
        deps.onError?.(error);
        return { events: [], configured: true, needsReconnect: false };
      }
    },
  };
}
