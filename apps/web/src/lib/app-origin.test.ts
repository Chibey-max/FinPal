import { afterEach, describe, expect, it, vi } from "vitest";

import { appOrigin } from "./app-origin";

describe("appOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the public URL, not the container's bind address", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://finpal.example.com/");
    expect(appOrigin("http://0.0.0.0:10000")).toBe(
      "https://finpal.example.com",
    );
  });

  it("falls back to the request when none is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
