import { createHash } from "node:crypto";

export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export const VOLATILE_OBSERVATION_TIMESTAMP_KEYS = [
  "lastFetchedAt",
  "lastObservedAt",
  "observedAt",
  "retrievedAt",
  "verifiedAt",
  "generatedAt"
] as const;

const volatileObservationTimestampKeys: ReadonlySet<string> = new Set(
  VOLATILE_OBSERVATION_TIMESTAMP_KEYS
);

/**
 * Produces a JSON-compatible clone with recursively sorted object keys.
 * Observation timestamps are omitted at every object depth, while array order
 * is retained because it is part of the observed content.
 */
export function canonicalizeJson(value: unknown): JsonValue {
  return canonicalize(value, new Set<object>());
}

export function canonicalJsonStringify(value: unknown): string {
  return stringifyCanonicalJson(canonicalizeJson(value));
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashCanonicalJson(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}

function canonicalize(value: unknown, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON only supports finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON does not support values of type ${typeof value}.`);
  }

  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON does not support circular references.");
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical JSON only supports arrays and plain objects.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalize(item, ancestors));
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => !volatileObservationTimestampKeys.has(key))
      .sort(compareStrings)
      .map((key) => [key, canonicalize(record[key], ancestors)] as const);

    return Object.fromEntries(entries) as JsonObject;
  } finally {
    ancestors.delete(value);
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stringifyCanonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stringifyCanonicalJson).join(",")}]`;
  }

  const members = Object.keys(value)
    .sort(compareStrings)
    .map((key) => `${JSON.stringify(key)}:${stringifyCanonicalJson(value[key])}`);
  return `{${members.join(",")}}`;
}
