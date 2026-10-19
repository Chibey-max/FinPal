import { z } from "zod";

import { type KernelClient, type MerchantTrustResult } from "./kernel-client";

export interface KernelHttpClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Overall budget for create + curl + delete. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.onkernel.com";

const browserSchema = z.object({
  session_id: z.string(),
});

const curlResultSchema = z.object({
  status: z.number().int(),
  duration_ms: z.number().int().optional(),
});

/**
 * Basic merchant trust via KERNEL: open a short-lived browser, fetch the
 * merchant URL through Chrome's stack, map the HTTP outcome to PASS/FAIL/
 * UNAVAILABLE. Timeouts and provider errors are UNAVAILABLE (fail-open to
 * manual review, never auto-approve on a failed check).
 */
export function createKernelHttpClient(
  options: KernelHttpClientOptions,
): KernelClient {
  const baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL).origin;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;

  async function send(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response> {
    return doFetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal,
    });
  }

  return {
    async checkMerchant(url: string): Promise<MerchantTrustResult> {
      let sessionId: string | undefined;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Reject non-http(s) early so we never hand KERNEL a bad URL.
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return {
            signal: "FAIL",
            evidence: { url, reason: "invalid_protocol" },
          };
        }

        const createResponse = await send(
          "/browsers",
          {
            method: "POST",
            body: JSON.stringify({
              headless: true,
              stealth: true,
              timeout_seconds: 60,
            }),
          },
          controller.signal,
        );
        if (!createResponse.ok) {
          return {
            signal: "UNAVAILABLE",
            evidence: {
              url,
              reason: "browser_create_failed",
              httpStatus: createResponse.status,
            },
          };
        }
        const browser = browserSchema.safeParse(await createResponse.json());
        if (!browser.success) {
          return {
            signal: "UNAVAILABLE",
            evidence: { url, reason: "invalid_browser_response" },
          };
        }
        sessionId = browser.data.session_id;

        const curlResponse = await send(
          `/browsers/${encodeURIComponent(sessionId)}/curl`,
          {
            method: "POST",
            body: JSON.stringify({
              url,
              method: "GET",
              timeout_ms: Math.min(8_000, timeoutMs),
            }),
          },
          controller.signal,
        );

        if (curlResponse.status === 502) {
          return {
            signal: "UNAVAILABLE",
            evidence: {
              url,
              sessionId,
              reason: "transport_error",
              httpStatus: 502,
            },
          };
        }
        if (!curlResponse.ok) {
          return {
            signal: "UNAVAILABLE",
            evidence: {
              url,
              sessionId,
              reason: "curl_failed",
              httpStatus: curlResponse.status,
            },
          };
        }

        const result = curlResultSchema.safeParse(await curlResponse.json());
        if (!result.success) {
          return {
            signal: "UNAVAILABLE",
            evidence: { url, sessionId, reason: "invalid_curl_response" },
          };
        }

        const status = result.data.status;
        // 2xx/3xx = reachable merchant page; 4xx/5xx = treat as failed trust.
        if (status >= 200 && status < 400) {
          return {
            signal: "PASS",
            evidence: {
              url,
              sessionId,
              httpStatus: status,
              durationMs: result.data.duration_ms ?? null,
            },
          };
        }
        return {
          signal: "FAIL",
          evidence: {
            url,
            sessionId,
            httpStatus: status,
            durationMs: result.data.duration_ms ?? null,
          },
        };
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" ||
            error.name === "AbortError" ||
            controller.signal.aborted);
        return {
          signal: "UNAVAILABLE",
          evidence: {
            url,
            sessionId: sessionId ?? null,
            reason: timedOut ? "timeout" : "network",
          },
        };
      } finally {
        clearTimeout(timer);
        if (sessionId) {
          // Best-effort cleanup; never mask the trust result.
          await send(
            `/browsers/${encodeURIComponent(sessionId)}`,
            { method: "DELETE" },
            AbortSignal.timeout(3_000),
          ).catch(() => undefined);
        }
      }
    },
  };
}
