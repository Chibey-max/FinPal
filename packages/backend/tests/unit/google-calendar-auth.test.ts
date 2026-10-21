import { describe, expect, it, vi } from "vitest";

import { createGoogleCalendarHttpClient } from "../../src/integrations/google-calendar/calendar-http-client";
import {
  createGoogleRefreshTokenProvider,
  GoogleAuthError,
} from "../../src/integrations/google-calendar/google-oauth";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const tokenResponse = (token: string, expiresIn = 3599) =>
  json({ access_token: token, expires_in: expiresIn, token_type: "Bearer" });

// A fresh Response each time: a body can only be read once.
const events = () =>
  json({
    items: [
      {
        id: "e1",
        summary: "Team lunch",
        start: { dateTime: "2026-10-22T12:00:00Z" },
      },
    ],
  });

function provider(fetchMock: typeof fetch, now = () => 0) {
  return createGoogleRefreshTokenProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    fetch: fetchMock,
    now,
  });
}

describe("Google refresh-token provider", () => {
  it("exchanges the refresh token at Google's token endpoint", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("access-1"));
    await expect(provider(fetchMock)()).resolves.toBe("access-1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual(
      {
        grant_type: "refresh_token",
        client_id: "client-id",
        client_secret: "client-secret",
        refresh_token: "refresh-token",
      },
    );
  });

  it("reuses the token until a minute before it expires, then refreshes", async () => {
    let clock = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("access-1", 3600))
      .mockResolvedValueOnce(tokenResponse("access-2", 3600));
    const getToken = provider(fetchMock, () => clock);

    expect(await getToken()).toBe("access-1");
    clock = 3_539_000; // 59m59s: still valid
    expect(await getToken()).toBe("access-1");
    clock = 3_541_000; // inside the last minute: refresh
    expect(await getToken()).toBe("access-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one refresh between simultaneous callers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse("access-1"));
    const getToken = provider(fetchMock);
    await Promise.all([getToken(), getToken(), getToken()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains a revoked or expired refresh token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: "invalid_grant" }, 400));
    const attempt = provider(fetchMock)();
    await expect(attempt).rejects.toBeInstanceOf(GoogleAuthError);
    await expect(attempt).rejects.toThrow(/revoked or has expired/);
  });

  it("retries after a failed refresh instead of caching the failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(tokenResponse("access-1"));
    const getToken = provider(fetchMock);
    await expect(getToken()).rejects.toMatchObject({ status: 0 });
    await expect(getToken()).resolves.toBe("access-1");
  });
});

describe("Google Calendar client with a token provider", () => {
  it("sends the provider's token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(events());
    const client = createGoogleCalendarHttpClient({
      accessToken: async () => "access-1",
      fetch: fetchMock,
    });

    await expect(client.listUpcomingEvents()).resolves.toHaveLength(1);
    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer access-1");
  });

  it("refreshes once and retries when Google rejects a cached token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: 401 } }, 401))
      .mockResolvedValueOnce(events());
    const tokens: boolean[] = [];
    const client = createGoogleCalendarHttpClient({
      accessToken: async ({ forceRefresh = false } = {}) => {
        tokens.push(forceRefresh);
        return forceRefresh ? "access-2" : "access-1";
      },
      fetch: fetchMock,
    });

    await expect(client.listUpcomingEvents()).resolves.toHaveLength(1);
    expect(tokens).toEqual([false, true]);
  });

  it("reports a failed token refresh as a calendar auth error", async () => {
    const client = createGoogleCalendarHttpClient({
      accessToken: async () => {
        throw new GoogleAuthError("revoked", 400);
      },
      fetch: vi.fn<typeof fetch>(),
    });
    await expect(client.listUpcomingEvents()).rejects.toMatchObject({
      name: "GoogleCalendarApiError",
      status: 401,
    });
  });

  it("does not retry a fixed token that Google rejects", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: { code: 401 } }, 401));
    const client = createGoogleCalendarHttpClient({
      accessToken: "expired-token",
      fetch: fetchMock,
    });
    await expect(client.listUpcomingEvents()).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
