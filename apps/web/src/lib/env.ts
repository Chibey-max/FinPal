import { publicEnvSchema } from "./env-schema";

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them
// into client bundles. Parsing is lazy so builds without Supabase keys succeed.
export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
