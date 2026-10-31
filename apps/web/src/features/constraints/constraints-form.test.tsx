import type { SpendingConstraints } from "@finpal/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  saveConstraints: vi.fn(),
}));

import { ConstraintsForm } from "./constraints-form";

const configured: SpendingConstraints = {
  timezone: "America/Los_Angeles",
  currency: "USD",
  timeWindows: [
    {
      days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      start: "08:00",
      end: "22:00",
    },
  ],
  amountCaps: {
    perPurchase: 500,
    daily: 800,
    monthly: 2_500,
  },
};

function renderForm(initial: SpendingConstraints | null) {
  return render(
    <ConstraintsForm
      initial={initial}
      timeZones={["America/Los_Angeles", "Africa/Lagos"]}
      spentToday={0}
      spentThisMonth={0}
    />,
  );
}

afterEach(cleanup);

describe("ConstraintsForm save state", () => {
  it("keeps save blocked while an unconfigured form is unchanged", () => {
    renderForm(null);

    const toggle = screen.getByRole("switch");
    expect(
      screen.getByRole("button", { name: "No changes to save" }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Save rules" })).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "No changes to save" }),
    ).toHaveProperty("disabled", true);
  });

  it("enables save only for changed configured values", () => {
    renderForm(configured);

    expect(
      screen.getByRole("button", { name: "No changes to save" }),
    ).toHaveProperty("disabled", true);

    const perTransaction = screen.getByLabelText("Per transaction");
    fireEvent.change(perTransaction, { target: { value: "600.00" } });
    expect(screen.getByRole("button", { name: "Save rules" })).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.change(perTransaction, { target: { value: "500.00" } });
    expect(
      screen.getByRole("button", { name: "No changes to save" }),
    ).toHaveProperty("disabled", true);
  });

  it("allows an existing configuration to be explicitly cleared", () => {
    renderForm(configured);

    fireEvent.click(screen.getByRole("switch"));

    expect(
      screen.getByRole("button", { name: "Turn rules off" }),
    ).toHaveProperty("disabled", false);
  });
});
