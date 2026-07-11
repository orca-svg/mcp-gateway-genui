import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify,
  canonicalizeJson,
  hashCanonicalJson,
  sha256Hex
} from "./canonical-json.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const input = {
      z: 3,
      nested: { z: 2, a: 1 },
      items: [
        { z: "first-z", a: "first-a" },
        { b: "second-b", a: "second-a" }
      ]
    };

    expect(canonicalJsonStringify(input)).toBe(
      '{"items":[{"a":"first-a","z":"first-z"},{"a":"second-a","b":"second-b"}],"nested":{"a":1,"z":2},"z":3}'
    );
    expect(canonicalizeJson(input)).toEqual({
      items: [
        { a: "first-a", z: "first-z" },
        { a: "second-a", b: "second-b" }
      ],
      nested: { a: 1, z: 2 },
      z: 3
    });
  });

  it("sorts integer-like object keys lexically instead of using property enumeration order", () => {
    expect(
      canonicalJsonStringify({
        10: "ten",
        2: "two",
        a: "letter",
        "01": "leading-zero"
      })
    ).toBe('{"01":"leading-zero","10":"ten","2":"two","a":"letter"}');
  });

  it("omits volatile observation timestamps at every object depth", () => {
    const input = {
      id: "benefit-1",
      lastFetchedAt: "2026-07-10T00:00:00.000Z",
      nested: {
        lastObservedAt: "2026-07-10T00:00:00.000Z",
        observedAt: "2026-07-10T00:00:00.000Z",
        stable: true
      },
      sources: [
        {
          retrievedAt: "2026-07-10T00:00:00.000Z",
          verifiedAt: "2026-07-10T00:00:00.000Z",
          generatedAt: "2026-07-10T00:00:00.000Z",
          generatedAtSource: "kept"
        }
      ]
    };

    expect(canonicalizeJson(input)).toEqual({
      id: "benefit-1",
      nested: { stable: true },
      sources: [{ generatedAtSource: "kept" }]
    });
  });

  it("hashes equivalent content identically and exposes a SHA-256 helper", () => {
    const first = {
      b: 2,
      a: 1,
      generatedAt: "2026-07-10T00:00:00.000Z"
    };
    const second = {
      a: 1,
      b: 2,
      generatedAt: "2026-07-11T00:00:00.000Z"
    };

    expect(hashCanonicalJson(first)).toBe(hashCanonicalJson(second));
    expect(hashCanonicalJson(first)).toBe(sha256Hex('{"a":1,"b":2}'));
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("treats array order as content", () => {
    expect(hashCanonicalJson({ items: ["a", "b"] })).not.toBe(
      hashCanonicalJson({ items: ["b", "a"] })
    );
  });

  it.each([
    ["undefined", undefined],
    ["functions", () => undefined],
    ["non-plain objects", new Date("2026-07-10T00:00:00.000Z")],
    ["non-finite numbers", Number.POSITIVE_INFINITY]
  ])("rejects %s", (_label, value) => {
    expect(() => canonicalizeJson(value)).toThrow(TypeError);
  });

  it("rejects circular references", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => canonicalizeJson(circular)).toThrow(/circular references/);
  });
});
