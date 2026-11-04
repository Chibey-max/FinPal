import Constants from "expo-constants";
import { Platform } from "react-native";

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

/**
 * Where the FinPal web app (and its /api/v1) is running. Set
 * EXPO_PUBLIC_API_URL to override. In development the host defaults to the
 * machine running Metro, so Expo Go on a phone reaches it over the LAN.
 */
export function apiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (Platform.OS === "web") return "http://localhost:3000";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:3000`;
  return Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";
}

// Set by the auth provider: the Supabase access token for the signed-in user.
// In mock mode there is no token and the server needs none.
let tokenProvider: () => Promise<string | null> = async () => null;
export function setAuthTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

export async function apiRequest<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {},
): Promise<T> {
  const token = await tokenProvider();
  const hasBody = init.body !== undefined;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: init.method ?? (hasBody ? "POST" : "GET"),
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK",
      `FinPal could not be reached at ${apiBaseUrl()}. Is the web app running?`,
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      data?.error?.code ??
        (response.status === 401 ? "UNAUTHORIZED" : "REQUEST_FAILED"),
      data?.error?.message ??
        data?.message ??
        `Request failed (${response.status}).`,
      data?.error?.details,
    );
  }
  return data as T;
}

export const apiGet = <T>(path: string) => apiRequest<T>(path);

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
