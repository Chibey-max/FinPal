import { describe, expect, it } from "vitest";

import { publicEnvSchema, serverEnvSchema } from "./env-schema";

const serverEnv = {
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  PAYPAL_CLIENT_ID: "client-id",
  PAYPAL_CLIENT_SECRET: "client-secret",
  CHANNEL3_API_KEY: "channel3",
};

describe("serverEnvSchema", () => {
  it("defaults to the PayPal Sandbox API and info logging", () => {
    const env = serverEnvSchema.parse(serverEnv);
    expect(env.PAYPAL_API_BASE_URL).toBe("https://api-m.sandbox.paypal.com");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects the live PayPal API", () => {
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      PAYPAL_API_BASE_URL: "https://api-m.paypal.com",
    });
    expect(result.success).toBe(false);
  });

  it("requires PayPal credentials", () => {
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      PAYPAL_CLIENT_SECRET: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe("publicEnvSchema", () => {
  it("requires Supabase URL and anon key", () => {
    expect(publicEnvSchema.safeParse({}).success).toBe(false);
    expect(
      publicEnvSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      }).success,
    ).toBe(true);
  });
});
