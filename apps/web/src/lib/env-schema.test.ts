import { describe, expect, it } from "vitest";

import { publicEnvSchema, serverEnvSchema } from "./env-schema";

const serverEnv = {
  DATABASE_URL: "postgres://localhost:5432/finpal",
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

  it.each([
    "https://api-m.paypal.com",
    "https://sandbox.evil.example",
    "https://api-m.sandbox.paypal.com.evil.example",
    "http://api-m.sandbox.paypal.com",
  ])("rejects non-Sandbox PayPal URL %s", (url) => {
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      PAYPAL_API_BASE_URL: url,
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

describe("serverEnvSchema database", () => {
  it("requires DATABASE_URL", () => {
    const result = serverEnvSchema.safeParse({
      ...serverEnv,
      DATABASE_URL: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe("publicEnvSchema", () => {
  it("defaults the app URL for local development", () => {
    expect(publicEnvSchema.parse({}).NEXT_PUBLIC_APP_URL).toBe(
      "http://localhost:3000",
    );
  });
});
