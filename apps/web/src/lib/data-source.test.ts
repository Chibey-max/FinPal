import { describe, expect, it } from "vitest";

import { getDataSource } from "./data-source";

describe("getDataSource", () => {
  it("honours an explicit choice", () => {
    expect(
      getDataSource({ FINPAL_DATA_SOURCE: "mock", NODE_ENV: "production" }),
    ).toBe("mock");
    expect(getDataSource({ FINPAL_DATA_SOURCE: "live" })).toBe("live");
  });

  it("uses mock in development until a database is configured", () => {
    expect(getDataSource({ NODE_ENV: "development" })).toBe("mock");
    expect(
      getDataSource({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost:5432/finpal",
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
