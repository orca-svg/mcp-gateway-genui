const KST_UTC_OFFSET_HOURS = 9;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convert a Korean public-data bare application deadline date to the gateway's
 * UTC-only `applicationDeadline` contract.
 *
 * Public-data sources commonly publish date-only deadlines in KST. A date-only
 * value means applications remain open through the end of that calendar day in
 * Korea, so `2026-07-15` becomes `2026-07-15T14:59:59.000Z` (23:59:59 KST).
 */
export function kstDeadlineToUtc(date: string): string {
  const match = DATE_ONLY_RE.exec(date);
  if (!match) {
    throw new Error("KST deadline must be a bare date in YYYY-MM-DD format.");
  }

  const [, yearPart, monthPart, dayPart] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const utcMillis = Date.UTC(year, month - 1, day, 24 - KST_UTC_OFFSET_HOURS - 1, 59, 59, 0);
  const normalized = new Date(utcMillis);

  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    throw new Error(`Invalid KST deadline date: ${date}`);
  }

  return normalized.toISOString();
}
