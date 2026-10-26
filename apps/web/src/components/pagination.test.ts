import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, pageWindow, paginate } from "./pagination";

describe("pagination", () => {
  it("uses ten items as the shared list limit", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });

  it("lists every page when there are few", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses distant pages into gaps", () => {
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
    expect(pageWindow(12, 12)).toEqual([1, "gap", 9, 10, 11, 12]);
  });

  it("clamps out-of-range and junk page numbers", () => {
    expect(paginate(42, "9", 10)).toMatchObject({
      page: 5,
      pageCount: 5,
      start: 40,
      end: 42,
    });
    expect(paginate(42, "abc", 10)).toMatchObject({
      page: 1,
      start: 0,
      end: 10,
    });
    expect(paginate(0, "3", 10)).toMatchObject({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
    });
  });
});
