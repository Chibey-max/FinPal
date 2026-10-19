/** An error response from /api/v1, in the `{ error: { code, message } }` shape. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Browser-side JSON call to the FinPal API. Throws ApiRequestError. */
export async function apiRequest<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers:
        init.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK",
      "FinPal could not be reached. Check your connection and retry.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      data?.error?.code ?? "REQUEST_FAILED",
      data?.error?.message ?? `Request failed (${response.status}).`,
      data?.error?.details,
    );
  }
  return data as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
