import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRYNTUM_FILES, BRYNTUM_VERSION, bryntumUrl } from "./bryntum-assets";

const root = join(__dirname, "../../../node_modules/@bryntum/calendar");

describe("bryntum assets", () => {
  it("matches the installed Bryntum version", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.version).toBe(BRYNTUM_VERSION);
  });

  it("only lists files that exist in the package", () => {
    for (const file of Object.keys(BRYNTUM_FILES)) {
      expect(() => readFileSync(join(root, file))).not.toThrow();
    }
  });

  it("puts the version in every URL so cached files never go stale", () => {
    expect(bryntumUrl("calendar.css")).toBe(
      `/vendor/bryntum/${BRYNTUM_VERSION}/calendar.css`,
    );
  });
});
