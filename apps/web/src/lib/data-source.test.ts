import { describe, expect, it } from "vitest";

import { getDataSource } from "./data-source";

describe("getDataSource", () => {
  it("honours an explicit choice", () => {
    expect(
      getDataSource({ FINPAL_DATA_SOURCE: "mock", NODE_ENV: "production" }),
    ).toBe("mock");
    expect(getDataSource({ FINPAL_DATA_SOURCE: "live" })).toBe("live");
  });

  it("uses mock in development until Supabase is configured", () => {
    expect(getDataSource({ NODE_ENV: "development" })).toBe("mock");
    expect(
      getDataSource({
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toBe("live");
  });

  it("fails closed in production: never mock unless asked", () => {
    expect(getDataSource({ NODE_ENV: "production" })).toBe("live");
    expect(
      getDataSource({ NODE_ENV: "production", FINPAL_DATA_SOURCE: "typo" }),
    ).toBe("live");
  });
});
