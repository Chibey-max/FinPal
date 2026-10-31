import { publicEnvSchema } from "./env-schema";

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them
// into client bundles. Parsing is lazy so builds without env values succeed.
export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}
