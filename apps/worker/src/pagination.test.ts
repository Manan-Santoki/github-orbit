import { describe, expect, it } from "vitest";
import { coverageIsComplete, nextPageForLoaded } from "./pagination";

describe("progressive GitHub pagination", () => {
  it("resumes after every completely loaded page", () => {
    expect(nextPageForLoaded(0)).toBe(1);
    expect(nextPageForLoaded(200)).toBe(3);
    expect(nextPageForLoaded(500)).toBe(6);
  });

  it("detects short final pages and exact reported totals", () => {
    expect(coverageIsComplete(53, 253, 10_000)).toBe(true);
    expect(coverageIsComplete(100, 500, 500)).toBe(true);
    expect(coverageIsComplete(100, 500, 53_744)).toBe(false);
  });
});
