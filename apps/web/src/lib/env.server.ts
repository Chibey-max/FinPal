import "server-only";

import { serverEnvSchema, type ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;

// Secrets are validated on first use so a missing key fails loudly at the call
// site instead of breaking unrelated pages or the build.
export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}

/** Only the Channel3 key, so price lookups work before PayPal is configured. */
export function getChannel3ApiKey(): string {
  return serverEnvSchema.pick({ CHANNEL3_API_KEY: true }).parse(process.env)
    .CHANNEL3_API_KEY;
}
