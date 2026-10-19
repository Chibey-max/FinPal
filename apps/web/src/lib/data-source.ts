/**
 * Which infrastructure the backend use cases run on.
 *
 * - "live": Supabase, PayPal Sandbox, Channel3 (needs .env.local).
 * - "mock": in-memory repositories and simulated PayPal / Channel3 / KERNEL /
 *   calendar. The real backend services still make every decision; only the
 *   storage and third parties are swapped (see lib/mock).
 *
 * Set FINPAL_DATA_SOURCE explicitly. When unset in development, mock is
 * used until Supabase is configured so the app runs out of the box. In
 * production it fails closed: never mock unless explicitly asked for, so a
 * missing env var can never expose the built-in demo user.
 */
export type DataSource = "live" | "mock";

export function getDataSource(
  env: Record<string, string | undefined> = process.env,
): DataSource {
  const explicit = env.FINPAL_DATA_SOURCE;
  if (explicit === "live" || explicit === "mock") return explicit;
  if (env.NODE_ENV === "production") return "live";
  return env.NEXT_PUBLIC_SUPABASE_URL ? "live" : "mock";
}

export const isMockMode = () => getDataSource() === "mock";

export interface AppUser {
  id: string;
  email: string | null;
}

/** The single signed-in user in mock mode. */
export const MOCK_USER: AppUser = {
  id: "7b0c1f0e-5d2a-4c1b-9e3f-0f1a2b3c4d5e",
  email: "demo@finpal.dev",
};
