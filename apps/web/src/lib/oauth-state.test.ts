import { describe, expect, it } from "vitest";

import { createOAuthState, parseOAuthState } from "./oauth-state";

describe("oauth-state", () => {
  it("round-trips the user id", () => {
    const state = createOAuthState("user-1", "secret");
    expect(parseOAuthState(state, "secret")).toBe("user-1");
  });

  it("rejects a tampered payload or wrong secret", () => {
    const state = createOAuthState("user-1", "secret");
    expect(parseOAuthState(state, "other")).toBeNull();
    expect(
      parseOAuthState(state.replace("user-1", "user-2"), "secret"),
    ).toBeNull();
    expect(parseOAuthState("not-a-state", "secret")).toBeNull();
  });
});
