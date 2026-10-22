import { z } from "zod";

import type { CalendarClient, CalendarEventSummary } from "./calendar-client";
import {
  GoogleAuthError,
  staticGoogleAccessToken,
  type GoogleAccessTokenProvider,
} from "./google-oauth";

export interface GoogleCalendarHttpClientOptions {
  /**
   * A token provider (preferred: createGoogleRefreshTokenProvider renews
   * tokens automatically) or a fixed access token, which expires in ~1 hour.
   */
  accessToken: string | GoogleAccessTokenProvider;
  /** Calendar id; defaults to the user's primary calendar. */
  calendarId?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const eventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  start: z
    .object({
      dateTime: z.string().optional(),
      date: z.string().optional(),
    })
    .optional(),
});

const listResponseSchema = z.object({
  items: z.array(z.unknown()).optional(),
});

export class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

/**
 * Reads upcoming events from one Google Calendar. Prefill uses title and
 * start time only — never product inference (PRD / Day 11).
 */
export function createGoogleCalendarHttpClient(
  options: GoogleCalendarHttpClientOptions,
): CalendarClient {
  const calendarId = encodeURIComponent(options.calendarId ?? "primary");
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const getToken =
    typeof options.accessToken === "string"
      ? staticGoogleAccessToken(options.accessToken)
      : options.accessToken;

  async function token(forceRefresh: boolean): Promise<string> {
    try {
      return await getToken({ forceRefresh });
    } catch (error) {
      if (!(error instanceof GoogleAuthError)) throw error;
      // Report token problems as calendar auth failures (401), or as
      // unreachable (0), so callers handle one error type.
      throw new GoogleCalendarApiError(
        error.message,
        error.status === 0 ? 0 : 401,
      );
    }
  }

  return {
    async listUpcomingEvents(limit = 20): Promise<CalendarEventSummary[]> {
      const params = new URLSearchParams({
        maxResults: String(Math.min(Math.max(limit, 1), 50)),
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: new Date().toISOString(),
      });
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`;
      const send = async (forceRefresh: boolean) => {
        const bearer = await token(forceRefresh);
        try {
          return await doFetch(url, {
            headers: { Authorization: `Bearer ${bearer}` },
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          const timedOut =
            error instanceof Error &&
            (error.name === "TimeoutError" || error.name === "AbortError");
          throw new GoogleCalendarApiError(
            timedOut
              ? "Google Calendar request timed out."
              : "Google Calendar is unreachable.",
            0,
          );
        }
      };

      let response = await send(false);
      // A cached token can be revoked before it expires: refresh once.
      if (response.status === 401 && typeof options.accessToken !== "string") {
        response = await send(true);
      }
      if (!response.ok) {
        throw new GoogleCalendarApiError(
          `Google Calendar failed with ${response.status}.`,
          response.status,
        );
      }
      const parsed = listResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!parsed.success) {
        throw new GoogleCalendarApiError(
          "Google Calendar returned an unexpected response.",
          response.status,
        );
      }

      return (parsed.data.items ?? []).flatMap((raw) => {
        const event = eventSchema.safeParse(raw);
        if (!event.success) return [];
        const startsAt =
          event.data.start?.dateTime ??
          (event.data.start?.date
            ? `${event.data.start.date}T00:00:00.000Z`
            : null);
        if (!startsAt) return [];
        return [
          {
            id: event.data.id,
            title: (event.data.summary ?? "Untitled event").slice(0, 500),
            startsAt,
          },
        ];
      });
    },
  };
}
