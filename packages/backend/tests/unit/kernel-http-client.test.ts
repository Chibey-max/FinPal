import { describe, expect, it, vi } from "vitest";

import { createKernelHttpClient } from "../../src/integrations/kernel/kernel-http-client";

describe("kernel http client", () => {
  it("returns PASS for a reachable merchant page and cleans up the browser", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/browsers") && init?.method === "POST") {
          return Response.json({ session_id: "sess-1" });
        }
        if (url.includes("/browsers/sess-1/curl")) {
          return Response.json({
            status: 200,
            headers: {},
            body: "ok",
            duration_ms: 120,
          });
        }
        if (url.endsWith("/browsers/sess-1") && init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return new Response("not found", { status: 404 });
      },
    );

    const client = createKernelHttpClient({
      apiKey: "key",
      fetch: fetchMock as typeof fetch,
    });
    const result = await client.checkMerchant("https://shop.example/product");

    expect(result.signal).toBe("PASS");
    expect(result.evidence).toMatchObject({
      url: "https://shop.example/product",
      sessionId: "sess-1",
      httpStatus: 200,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/browsers/sess-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("returns FAIL for a 404 merchant page", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/browsers") && init?.method === "POST") {
          return Response.json({ session_id: "sess-2" });
        }
        if (url.includes("/curl")) {
          return Response.json({
            status: 404,
            headers: {},
            body: "",
            duration_ms: 40,
          });
        }
        return new Response(null, { status: 204 });
      },
    );

    const client = createKernelHttpClient({
      apiKey: "key",
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      client.checkMerchant("https://bad.example/missing"),
    ).resolves.toMatchObject({ signal: "FAIL", evidence: { httpStatus: 404 } });
  });

  it("returns UNAVAILABLE on timeout", async () => {
    const fetchMock = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    const client = createKernelHttpClient({
      apiKey: "key",
      timeoutMs: 50,
      fetch: fetchMock as typeof fetch,
    });
    await expect(
      client.checkMerchant("https://slow.example"),
    ).resolves.toMatchObject({
      signal: "UNAVAILABLE",
      evidence: { reason: "timeout" },
    });
  });
});
