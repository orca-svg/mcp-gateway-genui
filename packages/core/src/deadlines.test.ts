import { describe, expect, it } from "vitest";
import { kstDeadlineToUtc } from "./deadlines.js";

describe("kstDeadlineToUtc", () => {
  it("maps a bare KST date to the end of that day in UTC", () => {
    expect(kstDeadlineToUtc("2026-07-15")).toBe("2026-07-15T14:59:59.000Z");
  });

  it("preserves end-of-day semantics across the UTC year boundary", () => {
    expect(kstDeadlineToUtc("2026-01-01")).toBe("2026-01-01T14:59:59.000Z");
  });

  it("rejects malformed or impossible dates", () => {
    expect(() => kstDeadlineToUtc("2026-7-15")).toThrow(/YYYY-MM-DD/);
    expect(() => kstDeadlineToUtc("2026-02-30")).toThrow(/Invalid KST deadline date/);
    expect(() => kstDeadlineToUtc("2026-07-15T23:59:59+09:00")).toThrow(/YYYY-MM-DD/);
  });
});
