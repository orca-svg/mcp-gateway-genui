/** Maximum public search-query length, measured in Unicode code points. */
export const QUERY_MAX_LENGTH = 300;

/** Opaque public IDs never contain whitespace, URL syntax, or display text. */
export const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export const NORMALIZED_QUERY_FORMAT = "normalized-safe-query";
export const NORMALIZED_DISPLAY_TEXT_FORMAT = "normalized-display-text";
export const SAFE_PUBLIC_URL_FORMAT = "safe-public-url";
export const SAFE_HTTPS_URL_FORMAT = "safe-https-url";

/**
 * Query policy used by both Zod and generated JSON Schema validators.
 *
 * Public queries must already be NFC-normalized, trimmed, free of control,
 * zero-width, and bidi-control characters, and between 1 and 300 code points.
 * Call `normalizeQuery` before validation when accepting raw UI text.
 */
export const QUERY_POLICY_DESCRIPTION =
  "NFC-normalized and trimmed; controls, zero-width characters, and bidi controls are not allowed; 1..300 Unicode code points.";

/**
 * Effective all-zero weights are valid. They produce score 0 for every
 * candidate and deterministic opaque-ID ordering; they never affect assessment.
 */
export const ZERO_SUM_WEIGHT_BEHAVIOR =
  "If all effective weights are zero, every ranking score is 0 and candidates use deterministic opaque-ID ordering; assessment is unchanged.";

// C0/C1 controls, zero-width joiners/spaces/BOM, word joiner, and Unicode bidi
// embedding/override/isolate controls. They are collapsed rather than silently
// concatenating the text on either side of a spoofing character.
const UNSAFE_INVISIBLE_CHARACTERS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

function truncateCodePoints(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("");
}

function isValidMaxLength(maxLength: number): boolean {
  return Number.isInteger(maxLength) && maxLength >= 0;
}

/**
 * Deterministically prepares untrusted display text for literal rendering.
 *
 * This is normalization, not a prompt-injection security boundary: phrases,
 * HTML, Markdown, and instruction-like text remain literal and are not filtered.
 */
export function normalizeDisplayText(value: string, maxLength: number): string {
  if (!isValidMaxLength(maxLength)) {
    throw new RangeError("maxLength must be a non-negative integer");
  }

  const normalized = value
    .normalize("NFC")
    .replace(UNSAFE_INVISIBLE_CHARACTERS, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return truncateCodePoints(normalized, maxLength).trimEnd();
}

/** Normalize raw query text before passing it to the strict public schema. */
export function normalizeQuery(value: string): string {
  return normalizeDisplayText(value, QUERY_MAX_LENGTH);
}

/** True only when a query already satisfies the strict public query policy. */
export function isNormalizedQuery(value: string): boolean {
  const length = Array.from(value).length;
  return length >= 1 && length <= QUERY_MAX_LENGTH && value === normalizeQuery(value);
}

/** True only for normalized, bounded literal display text. */
export function isNormalizedDisplayText(value: string): boolean {
  return value === normalizeDisplayText(value, Array.from(value).length);
}

/** HTTP(S) URL policy shared with the custom JSON Schema format. */
export function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

/** HTTPS-only URL policy used when a link is marked official. */
export function isSafeHttpsUrl(value: string): boolean {
  if (!isSafePublicUrl(value)) return false;
  return new URL(value).protocol === "https:";
}

export const JSON_SCHEMA_CUSTOM_FORMATS = {
  [NORMALIZED_QUERY_FORMAT]: isNormalizedQuery,
  [NORMALIZED_DISPLAY_TEXT_FORMAT]: isNormalizedDisplayText,
  [SAFE_PUBLIC_URL_FORMAT]: isSafePublicUrl,
  [SAFE_HTTPS_URL_FORMAT]: isSafeHttpsUrl
} as const;
