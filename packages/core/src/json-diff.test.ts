import { describe, expect, it } from "vitest";
import { diffJsonPointers, escapeJsonPointerToken } from "./json-diff.js";

describe("JSON diff pointers", () => {
  it("reports sorted, escaped pointers for nested replacements, additions, and removals", () => {
    const before = {
      "a/b": { "til~de": 1 },
      list: [{ id: "one", meta: { stable: true } }, { id: "two" }],
      removed: { nested: true }
    };
    const after = {
      "a/b": { added: true, "til~de": 2 },
      added: { nested: true },
      list: [
        { id: "one", meta: { stable: false } },
        { id: "two" },
        { id: "three" }
      ]
    };

    expect(diffJsonPointers(before, after)).toEqual([
      "/added",
      "/a~1b/added",
      "/a~1b/til~0de",
      "/list/0/meta/stable",
      "/list/2",
      "/removed"
    ]);
  });

  it("ignores timestamp-only observation changes at any depth", () => {
    const before = {
      lastFetchedAt: "2026-07-10T00:00:00.000Z",
      source: {
        retrievedAt: "2026-07-10T00:00:00.000Z",
        records: [{ id: "one", verifiedAt: "2026-07-10T00:00:00.000Z" }]
      }
    };
    const after = {
      lastFetchedAt: "2026-07-11T00:00:00.000Z",
      source: {
        retrievedAt: "2026-07-11T00:00:00.000Z",
        records: [{ id: "one", verifiedAt: "2026-07-11T00:00:00.000Z" }]
      }
    };

    expect(diffJsonPointers(before, after)).toEqual([]);
  });

  it("reports array additions, removals, replacements, and order changes by index", () => {
    expect(diffJsonPointers({ items: ["a"] }, { items: ["a", "b"] })).toEqual([
      "/items/1"
    ]);
    expect(diffJsonPointers({ items: ["a", "b"] }, { items: ["a"] })).toEqual([
      "/items/1"
    ]);
    expect(diffJsonPointers({ items: ["a", "b"] }, { items: ["b", "a"] })).toEqual([
      "/items/0",
      "/items/1"
    ]);
  });

  it("reports a replacement at the nearest path when JSON kinds differ", () => {
    expect(diffJsonPointers({ value: { nested: true } }, { value: "replaced" })).toEqual([
      "/value"
    ]);
    expect(diffJsonPointers("before", "after")).toEqual([""]);
  });

  it("escapes JSON Pointer reference tokens according to RFC 6901", () => {
    expect(escapeJsonPointerToken("a~/b")).toBe("a~0~1b");
  });
});
