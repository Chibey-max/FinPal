import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseFetch, SupabaseTimeoutError } from "./fetch";

const URL_ = "https://project.supabase.co/rest/v1/decisions?user_id=eq.secret";

/** A fetch that hangs until aborted, like a request on a dropped connection. */
const hang: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

const ok = () => Promise.resolve(new Response("[]", { status: 200 }));

describe("supabaseFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  function quiet() {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("passes a normal response straight through", async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    const response = await createSupabaseFetch({ fetch: fetchMock })(URL_);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a hung read once on a fresh request", async () => {
    quiet();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(hang)
      .mockImplementationOnce(ok);
    const response = await createSupabaseFetch({
      fetch: fetchMock,
      readTimeoutMs: 20,
    })(URL_);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with a clear error after the retry also hangs", async () => {
    quiet();
    const fetchMock = vi.fn<typeof fetch>(hang);
    const attempt = createSupabaseFetch({
      fetch: fetchMock,
      readTimeoutMs: 20,
    })(URL_);
    await expect(attempt).rejects.toBeInstanceOf(SupabaseTimeoutError);
    await expect(attempt).rejects.toThrow("GET /rest/v1/decisions");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a write, so nothing is saved twice", async () => {
    quiet();
    const fetchMock = vi.fn<typeof fetch>(hang);
    const attempt = createSupabaseFetch({
      fetch: fetchMock,
      writeTimeoutMs: 20,
    })(URL_, {
      method: "POST",
      body: "{}",
    });
    await expect(attempt).rejects.toBeInstanceOf(SupabaseTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the caller cancelled the request", async () => {
    quiet();
    const fetchMock = vi.fn<typeof fetch>(hang);
    const controller = new AbortController();
    const attempt = createSupabaseFetch({
      fetch: fetchMock,
      readTimeoutMs: 1_000,
    })(URL_, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(attempt).rejects.not.toBeInstanceOf(SupabaseTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps query strings (which hold user ids) out of logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>(hang);
    await createSupabaseFetch({ fetch: fetchMock, readTimeoutMs: 20 })(
      URL_,
    ).catch(() => {});
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("GET /rest/v1/decisions");
    expect(logged).not.toContain("secret");
  });
});
