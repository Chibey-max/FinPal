import Constants from "expo-constants";
import { Platform } from "react-native";

/** An error response from /api/v1, in the `{ error: { code, message } }` shape. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
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

export async function apiGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`);
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
      data?.error?.code ?? "REQUEST_FAILED",
      data?.error?.message ?? `Request failed (${response.status}).`,
    );
  }
  return data as T;
}
