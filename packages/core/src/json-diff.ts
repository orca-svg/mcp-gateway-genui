import {
  canonicalizeJson,
  type JsonObject,
  type JsonValue
} from "./canonical-json.js";

/**
 * Returns the exact RFC 6901 JSON Pointer locations whose canonical content
 * changed. Added and removed object members or array slots are reported at the
 * member/slot path; replacements recurse to the deepest differing locations.
 */
export function diffJsonPointers(before: unknown, after: unknown): string[] {
  const changed = new Set<string>();
  collectChangedPointers(
    canonicalizeJson(before),
    canonicalizeJson(after),
    "",
    changed
  );
  return [...changed].sort(compareStrings);
}

export function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function collectChangedPointers(
  before: JsonValue,
  after: JsonValue,
  pointer: string,
  changed: Set<string>
): void {
  if (isJsonPrimitive(before) || isJsonPrimitive(after)) {
    if (before !== after) changed.add(pointer);
    return;
  }

  const beforeIsArray = Array.isArray(before);
  const afterIsArray = Array.isArray(after);
  if (beforeIsArray !== afterIsArray) {
    changed.add(pointer);
    return;
  }

  if (beforeIsArray && afterIsArray) {
    const sharedLength = Math.min(before.length, after.length);
    for (let index = 0; index < sharedLength; index += 1) {
      collectChangedPointers(
        before[index],
        after[index],
        appendPointer(pointer, String(index)),
        changed
      );
    }
    const longestLength = Math.max(before.length, after.length);
    for (let index = sharedLength; index < longestLength; index += 1) {
      changed.add(appendPointer(pointer, String(index)));
    }
    return;
  }

  const beforeObject = before as JsonObject;
  const afterObject = after as JsonObject;
  const keys = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]);
  for (const key of [...keys].sort(compareStrings)) {
    const memberPointer = appendPointer(pointer, key);
    const beforeHasKey = Object.prototype.hasOwnProperty.call(beforeObject, key);
    const afterHasKey = Object.prototype.hasOwnProperty.call(afterObject, key);
    if (!beforeHasKey || !afterHasKey) {
      changed.add(memberPointer);
      continue;
    }
    collectChangedPointers(beforeObject[key], afterObject[key], memberPointer, changed);
  }
}

function appendPointer(pointer: string, token: string): string {
  return `${pointer}/${escapeJsonPointerToken(token)}`;
}

function isJsonPrimitive(value: JsonValue): value is null | boolean | number | string {
  return value === null || typeof value !== "object";
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
