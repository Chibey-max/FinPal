import { describe, expect, it, vi } from "vitest";

import type { CalendarConnectionRecord } from "../../src/repositories/calendar-connection-repository";
import {
  createCalendarConnectionService,
  decryptToken,
  encryptToken,
} from "../../src/use-cases/calendar-connections";

const USER = "user-1";
const SECRET = "client-secret";

function setup(fetchImpl: (url: string, init?: RequestInit) => Response) {
  const rows = new Map<string, CalendarConnectionRecord>();
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      fetchImpl(String(input), init),
  );
  const onError = vi.fn();
  const service = createCalendarConnectionService({
    connections: {
      get: async (id) => rows.get(id) ?? null,
      save: async (id, token) => {
        rows.set(id, {
          userId: id,
          refreshTokenEncrypted: token,
          needsReconnect: false,
        });
      },
      markNeedsReconnect: async (id) => {
        rows.get(id)!.needsReconnect = true;
      },
      remove: async (id) => {
        rows.delete(id);
      },
    },
    clientId: "client-id",
    clientSecret: SECRET,
    redirectUri: "https://app.example/api/v1/calendar/callback",
    fetch: fetchMock as unknown as typeof fetch,
    onError,
  });
  return { service, rows, fetchMock, onError };
}

const googleOk = (url: string) => {
  if (url.includes("oauth2.googleapis.com/token")) {
    return Response.json({
      refresh_token: "1//refresh",
      access_token: "ya29.access",
      expires_in: 3600,
    });
  }
  return Response.json({
    items: [
      {
        id: "e1",
        summary: "Flight",
        start: { dateTime: "2026-11-02T10:00:00Z" },
      },
    ],
  });
};

describe("token encryption", () => {
  it("round-trips, and the stored form doesn't contain the token", () => {
    const stored = encryptToken("1//secret-token", SECRET);
    expect(stored).not.toContain("secret-token");
    expect(decryptToken(stored, SECRET)).toBe("1//secret-token");
  });

  it("uses a new IV each time", () => {
    expect(encryptToken("a", SECRET)).not.toBe(encryptToken("a", SECRET));
  });

  it("refuses a different key and tampered data", () => {
    const stored = encryptToken("token", SECRET);
    expect(() => decryptToken(stored, "other")).toThrow();
    expect(() => decryptToken(`${stored}x`, SECRET)).toThrow();
  });
});

describe("calendar connections", () => {
  it("asks Google for offline, read-only access", () => {
    const url = new URL(setup(googleOk).service.consentUrl("state-1"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("calendar.readonly");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("reports not connected without calling Google", async () => {
    const { service, fetchMock } = setup(googleOk);
    await expect(service.listUpcoming(USER)).resolves.toEqual({
      events: [],
      configured: false,
      needsReconnect: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores the token encrypted and reads that user's events", async () => {
    const { service, rows } = setup(googleOk);
    await service.complete(USER, "code");
    expect(rows.get(USER)?.refreshTokenEncrypted).not.toContain("1//refresh");

    const page = await service.listUpcoming(USER);
    expect(page.configured).toBe(true);
    expect(page.events[0]?.title).toBe("Flight");
    expect((await service.listUpcoming("someone-else")).configured).toBe(false);
  });

  it("asks to reconnect when Google cancels the token", async () => {
    let cancelled = false;
    const { service, rows, fetchMock } = setup((url) =>
      cancelled && url.includes("/token")
        ? Response.json({ error: "invalid_grant" }, { status: 400 })
        : googleOk(url),
    );
    await service.complete(USER, "code");
    cancelled = true;

    const page = await service.listUpcoming(USER);
    expect(page).toMatchObject({ configured: false, needsReconnect: true });
    expect(rows.get(USER)?.needsReconnect).toBe(true);

    fetchMock.mockClear();
    await service.listUpcoming(USER);
    expect(fetchMock).not.toHaveBeenCalled();

    cancelled = false;
    await service.complete(USER, "code-2");
    expect((await service.listUpcoming(USER)).configured).toBe(true);
  });

  it("stays connected through a Google outage", async () => {
    let down = false;
    const { service, onError, rows } = setup((url) =>
      down ? new Response("", { status: 503 }) : googleOk(url),
    );
    await service.complete(USER, "code");
    down = true;
    const page = await service.listUpcoming(USER);
    expect(page).toEqual({
      events: [],
      configured: true,
      needsReconnect: false,
    });
    expect(rows.get(USER)?.needsReconnect).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it("revokes at Google and deletes on disconnect", async () => {
    const { service, rows, fetchMock } = setup(googleOk);
    await service.complete(USER, "code");
    await service.disconnect(USER);
    expect(rows.has(USER)).toBe(false);
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("/revoke")),
    ).toBe(true);
  });

  it("fails when Google gives no refresh token", async () => {
    const { service, rows } = setup(() => Response.json({ access_token: "x" }));
    await expect(service.complete(USER, "code")).rejects.toThrow();
    expect(rows.size).toBe(0);
  });
});
