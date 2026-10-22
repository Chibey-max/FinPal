// fetch for every server-side Supabase client: bounded and observable.
//
// A stalled connection would otherwise hold a page for over a minute. With a
// time limit it fails fast with a clear error, and slow calls are logged so
// the cause can be found.

// Reads get a shorter limit and one retry: a request sent on a connection the
// network silently dropped (common on mobile and home broadband after idle)
// never completes, and a retry opens a fresh one. Writes are never retried,
// so nothing is saved twice.
const READ_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 15_000;
const SLOW_MS = 2_000;

type FetchInput = Parameters<typeof fetch>[0];

function methodOf(input: FetchInput, init?: RequestInit) {
  return (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
}

/** "GET /rest/v1/decisions" without the query string (it holds user ids). */
function describe(input: FetchInput, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return `${methodOf(input, init)} ${url.pathname}`;
}

export class SupabaseTimeoutError extends Error {
  constructor(request: string, ms: number) {
    super(`Supabase request timed out after ${ms / 1000}s: ${request}`);
    this.name = "SupabaseTimeoutError";
  }
}

export interface SupabaseFetchOptions {
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
  slowMs?: number;
  fetch?: typeof fetch;
}

export function createSupabaseFetch(
  options: SupabaseFetchOptions = {},
): typeof fetch {
  const readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;
  const writeTimeoutMs = options.writeTimeoutMs ?? WRITE_TIMEOUT_MS;
  const slowMs = options.slowMs ?? SLOW_MS;
  const doFetch = options.fetch ?? fetch;

  async function attempt(
    input: FetchInput,
    init: RequestInit | undefined,
    ms: number,
  ) {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    try {
      return await doFetch(input, { ...init, signal });
    } catch (error) {
      if (timeout.aborted && !init?.signal?.aborted) {
        throw new SupabaseTimeoutError(describe(input, init), ms);
      }
      throw error;
    }
  }

  return async (input, init) => {
    const isRead = ["GET", "HEAD"].includes(methodOf(input, init));
    const started = performance.now();
    try {
      try {
        return await attempt(
          input,
          init,
          isRead ? readTimeoutMs : writeTimeoutMs,
        );
      } catch (error) {
        if (!isRead || !(error instanceof SupabaseTimeoutError)) throw error;
        console.warn(`${error.message}; retrying once.`);
        return await attempt(input, init, readTimeoutMs);
      }
    } catch (error) {
      if (error instanceof SupabaseTimeoutError) console.error(error.message);
      throw error;
    } finally {
      const elapsed = Math.round(performance.now() - started);
      if (elapsed > slowMs) {
        console.warn(
          `Slow Supabase request (${elapsed}ms): ${describe(input, init)}`,
        );
      }
    }
  };
}

export const supabaseFetch = createSupabaseFetch();
